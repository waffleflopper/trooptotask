import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildSourceRows, ReviewMemo, reviewRows } from './rowModel';
import { personnelLane } from './importFlow.test-support';
import {
	detectLayout,
	duplicateMappedFields,
	extendColumnTargets,
	headerKey,
	missingRequiredFields,
	parseDelimited,
	readImportFile,
	type LoadedFile
} from './workbookSource';

async function excelFile(workbook: ExcelJS.Workbook): Promise<File> {
	return new File([new Uint8Array(await workbook.xlsx.writeBuffer())], 'roster.xlsx');
}

describe('workbook source', () => {
	it('automatically keeps the first source for each field and ignores competing aliases and splitters', () => {
		const lane = personnelLane();
		const file: LoadedFile = {
			name: 'aliases.csv',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'Surname', 'First name', 'Name', 'Rank'],
						['Smith', 'Wrong', 'Alex', 'Other, Pat', 'SGT']
					]
				}
			]
		};
		const layout = detectLayout(file, lane);
		expect(layout.columns.get(headerKey('Surname'))).toEqual({ kind: 'ignore' });
		expect(layout.columns.get(headerKey('Name'))).toEqual({ kind: 'ignore' });
		expect(buildSourceRows(file, layout, lane).map((row) => row.raw)).toEqual([
			{ lastName: 'Smith', firstName: 'Alex', rank: 'SGT' }
		]);
	});
	it('checks mapping collisions within included sheets while allowing aliases on separate sheets', () => {
		const lane = personnelLane();
		const file: LoadedFile = {
			name: 'rosters.xlsx',
			sheets: [
				{ index: 0, name: 'HQ', hidden: false, rows: [['Last name', 'First name', 'Rank']] },
				{ index: 1, name: 'PLT', hidden: false, rows: [['Surname', 'First name', 'Rank']] },
				{ index: 2, name: 'Lookups', hidden: true, rows: [['Last name', 'Extra', 'First name', 'Rank']] }
			]
		};
		const detected = detectLayout(file, lane);
		const layout = extendColumnTargets(
			{ ...detected, sheets: detected.sheets.map((sheet, index) => ({ ...sheet, included: index !== 2 })) },
			file,
			lane
		);
		expect(duplicateMappedFields(layout, file, lane)).toEqual([]);
		expect(layout.columns.get(headerKey('Surname'))).toEqual({ kind: 'field', field: 'lastName' });
		const withLookups = {
			...layout,
			columns: new Map(layout.columns).set(headerKey('Extra'), { kind: 'field', field: 'lastName' } as const),
			sheets: layout.sheets.map((sheet) => ({ ...sheet, included: true }))
		};
		expect(duplicateMappedFields(withLookups, file, lane)).toEqual([{ label: 'Last name', sheet: 'Lookups' }]);
	});
	it('reads matching roster tabs, a cover, and hidden lookups with physical rows and cached formulas', async () => {
		const workbook = new ExcelJS.Workbook();
		workbook.addWorksheet('Cover').addRows([['Roster'], ['Rank'], ['Read instructions']]);
		for (const [sheet, name] of [
			['1st PLT', 'Smith'],
			['2nd PLT', 'Jones']
		]) {
			const tab = workbook.addWorksheet(sheet);
			tab.addRows([
				['Unit roster'],
				['UNCLASSIFIED'],
				['Last name', 'First name', 'Rank'],
				[name, 'Alex', { formula: '"SGT"', result: 'SGT' }],
				[],
				['Update', 'Pat', 'CPL']
			]);
		}
		const hidden = workbook.addWorksheet('Lookups', { state: 'veryHidden' });
		hidden.addRows([
			['Last name', 'First name', 'Rank'],
			['Not', 'Imported', 'SGT']
		]);
		const result = await readImportFile(await excelFile(workbook));
		expect(result.kind).toBe('loaded');
		if (result.kind !== 'loaded') throw new Error('Workbook rejected');
		expect(result.file.sheets.map((sheet) => [sheet.name, sheet.hidden])).toEqual([
			['Cover', false],
			['1st PLT', false],
			['2nd PLT', false],
			['Lookups', true]
		]);
		const lane = personnelLane();
		const layout = detectLayout(result.file, lane);
		expect(layout.sheets.map((sheet) => [sheet.included, sheet.headerRow])).toEqual([
			[false, null],
			[true, 2],
			[true, 2],
			[false, 0]
		]);
		expect(layout.sheets[3].reason).toBe('Hidden in Excel');
		const rows = buildSourceRows(result.file, layout, lane);
		expect(rows.map((row) => [row.id, row.rowNumber, row.raw.lastName, row.raw.rank])).toEqual([
			['1:3', 4, 'Smith', 'SGT'],
			['1:5', 6, 'Update', 'CPL'],
			['2:3', 4, 'Jones', 'SGT'],
			['2:5', 6, 'Update', 'CPL']
		]);
		expect(result.file.sheets[1].rows[4]).toEqual([]);
	});
	it('uses 1904 serials, including cached numeric formulas, when reviewing dates', async () => {
		const workbook = new ExcelJS.Workbook();
		workbook.properties.date1904 = true;
		workbook.addWorksheet('Roster').addRows([
			['Last name', 'First name', 'Rank', 'ETS'],
			['Smith', 'Alex', 'SGT', { formula: '45046', result: 45046 }]
		]);
		const result = await readImportFile(await excelFile(workbook));
		if (result.kind !== 'loaded') throw new Error('Workbook rejected');
		const lane = personnelLane();
		const review = reviewRows(
			buildSourceRows(result.file, detectLayout(result.file, lane), lane),
			lane,
			new Map(),
			new Set(),
			new ReviewMemo()
		);
		expect(review.rows[0]).toMatchObject({ outcome: 'new', change: { ets: '2027-05-01' } });
	});
	it('reads a comma file whose banner line holds a tab as comma-delimited', async () => {
		const result = await readImportFile(
			new File(['UNCLASSIFIED\t2026\r\nLast name,First name,Rank\r\nSmith,Alex,SGT'], 'roster.csv')
		);
		if (result.kind !== 'loaded') throw new Error('CSV rejected');
		expect(result.file.sheets[0].rows).toEqual([
			['UNCLASSIFIED\t2026'],
			['Last name', 'First name', 'Rank'],
			['Smith', 'Alex', 'SGT']
		]);
	});
	it('loads TSV and quoted CSV cells while preserving empty physical rows', async () => {
		const result = await readImportFile(
			new File(['Last name\tFirst name\tRank\r\nSmith\tAlex\tSGT\r\n\r\nJones\tPat\tCPL'], 'roster.tsv')
		);
		if (result.kind !== 'loaded') throw new Error('TSV rejected');
		const lane = personnelLane();
		expect(
			buildSourceRows(result.file, detectLayout(result.file, lane), lane).map((row) => [
				row.rowNumber,
				row.raw.lastName
			])
		).toEqual([
			[2, 'Smith'],
			[4, 'Jones']
		]);
		expect(parseDelimited('Name,Note\n"Smith, Alex","line 1\nline ""2"""', ',')).toEqual([
			['Name', 'Note'],
			['Smith, Alex', 'line 1\nline "2"']
		]);
		expect((await readImportFile(new File(['x'], 'bad.pdf'))).kind).toBe('rejected');
		expect((await readImportFile(new File(['"missing'], 'bad.csv'))).kind).toBe('rejected');
	});
	it('weights required coverage, groups reordered headers, and keeps hand mappings after header changes', () => {
		const file: LoadedFile = {
			name: 'test',
			sheets: [
				{
					index: 0,
					name: 'A',
					hidden: false,
					rows: [
						['Rank', 'MOS'],
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'SGT']
					]
				},
				{
					index: 1,
					name: 'B',
					hidden: false,
					rows: [
						['Rank', 'First name', 'Last name'],
						['CPL', 'Pat', 'Jones']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		expect(layout.sheets.map((sheet) => [sheet.included, sheet.headerRow])).toEqual([
			[true, 1],
			[true, 0]
		]);
		const manual = { ...layout, columns: new Map(layout.columns).set(headerKey('Rank'), { kind: 'ignore' } as const) };
		expect(extendColumnTargets(manual, file, lane).columns.get(headerKey('Rank'))).toEqual({ kind: 'ignore' });
		expect(missingRequiredFields(manual, file, lane)).toEqual([{ field: 'rank', label: 'Rank' }]);
	});
	it('does not treat a lone splitter alias on a cover sheet as a recognizable header', () => {
		const file: LoadedFile = {
			name: 'cover.xlsx',
			sheets: [
				{ index: 0, name: 'Cover', hidden: false, rows: [['Name'], ['Roster'], ['Instructions'], ['Use spreadsheet']] },
				{
					index: 1,
					name: 'Roster',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'SGT']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		expect(layout.sheets.map((sheet) => [sheet.included, sheet.headerRow])).toEqual([
			[false, null],
			[true, 0]
		]);
		expect(buildSourceRows(file, layout, lane).map((row) => row.raw.lastName)).toEqual(['Smith']);
	});
});
