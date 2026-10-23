import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { writeWorkbookBuffer } from '$lib/utils/workbook';
import { buildNotImported, buildTemplate } from './workbooks';
import { buildReceipt, type CommitResult } from './commit';
import { applyEdits, buildSourceRows, reviewRows, ReviewMemo, sourceRowId } from './rowModel';
import { defineImportLane } from './types';
import { personnelLane } from './importFlow.test-support';
import { detectLayout, readImportFile, type LoadedFile } from './workbookSource';

async function readBack(workbook: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
	const loaded = new ExcelJS.Workbook();
	await loaded.xlsx.load(await writeWorkbookBuffer(workbook));
	return loaded;
}

describe('workbook export', () => {
	it('retries reviewed skipped and failed pivot values while omitting saved and unchanged cells', async () => {
		const options = ['CPR', 'TCCC', 'PALS', 'ACLS', 'NRP'].map((value) => ({ id: value, label: value, value }));
		const lane = defineImportLane({
			id: 'training',
			noun: { one: 'record', other: 'records' },
			columns: {
				person: { label: 'Person', kind: 'text', required: true, aliases: [] },
				training: { label: 'Training', kind: 'text', required: true, aliases: [] },
				result: { label: 'Result', kind: 'text', required: true, aliases: [] }
			},
			pivot: { field: 'training', valueField: 'result', label: 'Training' },
			references: {
				training: {
					label: 'training',
					reads: ['training'],
					options,
					whenMissing: 'ask',
					key: (raw) => (raw.training ? { key: raw.training, display: raw.training } : null),
					find(key) {
						const option = options.find((item) => item.id === key);
						return option ? { kind: 'one', option } : { kind: 'none' };
					}
				}
			},
			review: ({ values }) => ({ outcome: 'new', key: `${values.person}:${values.training}`, change: values }),
			commitChunk: async () => ({ kind: 'unconfirmed' }),
			exit: { href: '/', label: 'Back' }
		});
		const file: LoadedFile = {
			name: 'wide.xlsx',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Person', 'CPR', 'TCCC', 'PALS', 'ACLS', 'NRP'],
						['Smith', '01MAY27', '02MAY27', '03MAY27', '31FEB2026', '05MAY27']
					]
				}
			]
		};
		const layout = detectLayout(file, lane);
		const rows = applyEdits(
			buildSourceRows(file, layout, lane),
			new Map([
				[sourceRowId(0, 1, 4), { result: '2026-03-11' }],
				[sourceRowId(0, 1, 5), { result: '2026-03-12' }]
			])
		);
		const receipt = buildReceipt(
			[{ row: rows[4], reason: 'Skipped' }],
			new Map<(typeof rows)[number]['id'], CommitResult>([
				[rows[0].id, { kind: 'added' }],
				[rows[1].id, { kind: 'updated' }],
				[rows[3].id, { kind: 'failed', reason: 'Denied' }]
			]),
			new Map(rows.map((row) => [row.id, row])),
			null,
			1
		);
		const exported = await readBack(await buildNotImported(file, layout, receipt));
		expect(exported.worksheets[0].getRow(2).values).toEqual([
			undefined,
			'Smith',
			'',
			'',
			'',
			'2026-03-11',
			'2026-03-12',
			'ACLS: Denied; NRP: Skipped'
		]);
		const retry = await readImportFile(new File([await writeWorkbookBuffer(exported)], 'retry.xlsx'));
		if (retry.kind !== 'loaded') throw new Error('Retry rejected');
		expect(buildSourceRows(retry.file, detectLayout(retry.file, lane), lane).map((row) => row.raw)).toEqual([
			{ person: 'Smith', training: 'ACLS', result: '2026-03-11' },
			{ person: 'Smith', training: 'NRP', result: '2026-03-12' }
		]);
	});
	it('round-trips corrected pivot names and values without losing collisions', async () => {
		const option = { id: 'CPR', label: 'CPR', value: 'CPR' };
		const lane = defineImportLane({
			id: 'training',
			noun: { one: 'record', other: 'records' },
			columns: {
				person: { label: 'Person', kind: 'text', required: true, aliases: [] },
				training: { label: 'Training', kind: 'text', required: true, aliases: [] },
				completed: { label: 'Completed', kind: 'text', required: true, aliases: [] }
			},
			pivot: { field: 'training', valueField: 'completed', label: 'Training' },
			references: {
				training: {
					label: 'training',
					reads: ['training'],
					options: [option],
					whenMissing: 'ask',
					key: (raw) => (raw.training ? { key: raw.training, display: raw.training } : null),
					find: (key) => (key === 'CPR' ? { kind: 'one', option } : { kind: 'none' })
				}
			},
			review: ({ values }) => ({ outcome: 'new', key: `${values.person}:${values.training}`, change: values }),
			commitChunk: async () => ({ kind: 'unconfirmed' }),
			exit: { href: '/', label: 'Back' }
		});
		const file: LoadedFile = {
			name: 'wide.xlsx',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Person', 'CPRR', 'CPR', 'TCCC'],
						['Smith', '2026-01-01', '2026-02-01', '2026-02-02'],
						['Jones', '2026-03-01', '', ''],
						['Lee', '', '2026-04-01', '2026-04-02']
					]
				}
			]
		};
		const layout = detectLayout(file, lane);
		const rows = applyEdits(
			buildSourceRows(file, layout, lane),
			new Map([
				[sourceRowId(0, 1, 1), { training: 'CPR', completed: '2026-05-01' }],
				[sourceRowId(0, 2, 1), { training: 'ACLS', completed: '2026-05-02' }],
				[sourceRowId(0, 3, 2), { training: ' cpr ' }],
				[sourceRowId(0, 3, 3), { training: ' acls ', completed: '2026-05-03' }]
			])
		);
		const receipt = buildReceipt(
			[{ row: rows[3], reason: 'Skipped' }],
			new Map<(typeof rows)[number]['id'], CommitResult>([
				[rows[0].id, { kind: 'failed', reason: 'Denied' }],
				[rows[1].id, { kind: 'failed', reason: 'Denied' }],
				[rows[2].id, { kind: 'added' }],
				[rows[4].id, { kind: 'failed', reason: 'Denied' }],
				[rows[5].id, { kind: 'failed', reason: 'Denied' }]
			]),
			new Map(rows.map((row) => [row.id, row])),
			null
		);
		const exported = await buildNotImported(file, layout, receipt);
		const retry = await readImportFile(new File([await writeWorkbookBuffer(exported)], 'retry.xlsx'));
		if (retry.kind !== 'loaded') throw new Error('Retry rejected');
		expect(buildSourceRows(retry.file, detectLayout(retry.file, lane), lane).map((row) => row.raw)).toEqual([
			{ person: 'Smith', training: 'CPR', completed: '2026-05-01' },
			{ person: 'Smith', training: 'CPR', completed: '2026-02-01' },
			{ person: 'Jones', training: 'ACLS', completed: '2026-05-02' },
			{ person: 'Lee', training: 'CPR', completed: '2026-04-01' },
			{ person: 'Lee', training: 'ACLS', completed: '2026-05-03' }
		]);
		expect(retry.file.sheets[0].rows[0]).toEqual(['Person', 'CPRR', 'CPR', 'TCCC', 'ACLS', 'Reason']);
		expect(retry.file.sheets[0].rows[1]).toEqual(['Smith', '', '2026-05-01', '', '', 'CPR: Denied']);
	});
	it('writes template headers and examples as literal text, including formula prefixes', async () => {
		const workbook = await readBack(
			await buildTemplate({
				columns: {
					a: { label: '=HEADER()', kind: 'text', aliases: [], example: '=1+1' },
					b: { label: '+Label', kind: 'text', aliases: [], example: '+2' },
					c: { label: '-Label', kind: 'text', aliases: [], example: '-2' },
					d: { label: '@Label', kind: 'text', aliases: [], example: '@SUM(A1)' }
				}
			})
		);
		const sheet = workbook.worksheets[0];
		expect([
			sheet.getCell('A1').value,
			sheet.getCell('A2').value,
			sheet.getCell('B2').value,
			sheet.getCell('C2').value,
			sheet.getCell('D2').value
		]).toEqual(['=HEADER()', '=1+1', '+2', '-2', '@SUM(A1)']);
		expect([
			sheet.getCell('A2').type,
			sheet.getCell('B2').type,
			sheet.getCell('C2').type,
			sheet.getCell('D2').type
		]).toEqual([
			ExcelJS.ValueType.String,
			ExcelJS.ValueType.String,
			ExcelJS.ValueType.String,
			ExcelJS.ValueType.String
		]);
	});
	it('keeps original columns and raw values plus Reason in the not-imported file', async () => {
		const file: LoadedFile = {
			name: 'input.xlsx',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank', 'Notes'],
						['=BAD()', '+Alex', '-SGT', '@literal']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		const rows = buildSourceRows(file, layout, lane);
		const receipt = buildReceipt(
			[{ row: rows[0], reason: '=Denied' }],
			new Map(),
			new Map(rows.map((row) => [row.id, row])),
			null
		);
		const exported = await readBack(await buildNotImported(file, layout, receipt));
		const sheet = exported.worksheets[0];
		expect(sheet.getRow(1).values).toEqual([undefined, 'Last name', 'First name', 'Rank', 'Notes', 'Reason']);
		expect(sheet.getRow(2).values).toEqual([undefined, '=BAD()', '+Alex', '-SGT', '@literal', '=Denied']);
		expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
		expect(sheet.getCell('E2').type).toBe(ExcelJS.ValueType.String);
	});
	it('writes the values the user corrected during review into the not-imported file', async () => {
		const file: LoadedFile = {
			name: 'input.xlsx',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank'],
						['Smith', 'Alex', 'Sgt.']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		const [row] = applyEdits(buildSourceRows(file, layout, lane), new Map([[sourceRowId(0, 1), { rank: 'SGT' }]]));
		const receipt = buildReceipt([{ row, reason: 'Skipped' }], new Map(), new Map([[row.id, row]]), null);
		const exported = await readBack(await buildNotImported(file, layout, receipt));
		expect(exported.worksheets[0].getRow(2).values).toEqual([undefined, 'Smith', 'Alex', 'SGT', 'Skipped']);
	});
	it('joins corrected split-name fields back into the combined column of the not-imported file', async () => {
		const file: LoadedFile = {
			name: 'input.xlsx',
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Name', 'Rank'],
						['Smith, Alx', 'SGT']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		const [row] = applyEdits(
			buildSourceRows(file, layout, lane),
			new Map([[sourceRowId(0, 1), { firstName: 'Alex' }]])
		);
		const receipt = buildReceipt([{ row, reason: 'Skipped' }], new Map(), new Map([[row.id, row]]), null);
		const exported = await readBack(await buildNotImported(file, layout, receipt, lane.splitters));
		expect(exported.worksheets[0].getRow(2).values).toEqual([undefined, 'Smith, Alex', 'SGT', 'Skipped']);
	});
	it('keeps 1904 serial dates meaningful after exporting and re-importing a skipped row', async () => {
		const file: LoadedFile = {
			name: 'dates.xlsx',
			date1904: true,
			sheets: [
				{
					index: 0,
					name: 'HQ',
					hidden: false,
					rows: [
						['Last name', 'First name', 'Rank', 'ETS'],
						['Smith', 'Alex', 'SGT', '45046']
					]
				}
			]
		};
		const lane = personnelLane();
		const layout = detectLayout(file, lane);
		const rows = buildSourceRows(file, layout, lane);
		const receipt = buildReceipt(
			[{ row: rows[0], reason: 'Skipped' }],
			new Map(),
			new Map(rows.map((row) => [row.id, row])),
			null
		);
		const workbook = await buildNotImported(file, layout, receipt);
		const result = await readImportFile(new File([await writeWorkbookBuffer(workbook)], 'retry.xlsx'));
		if (result.kind !== 'loaded') throw new Error('Retry rejected');
		expect(result.file.date1904).toBe(true);
		const review = reviewRows(
			buildSourceRows(result.file, detectLayout(result.file, lane), lane),
			lane,
			new Map(),
			new Set(),
			new ReviewMemo()
		);
		expect(review.rows[0]).toMatchObject({ outcome: 'new', change: { ets: '2027-05-01' } });
	});
	it('re-imports wide date-or-mark columns with the source date system and ignores exported Reason metadata', async () => {
		const columns = {
			person: { label: 'Person', kind: 'text', required: true, aliases: [] },
			training: { label: 'Training', kind: 'text', required: true, aliases: [] },
			result: { label: 'Result', kind: 'text', required: true, aliases: [] }
		} as const;
		const option = { id: 'CPR', label: 'CPR', value: 'CPR' };
		const lane = defineImportLane({
			id: 'training',
			noun: { one: 'record', other: 'records' },
			columns,
			pivot: { field: 'training', valueField: 'result', label: 'Training' },
			references: {
				training: {
					label: 'training',
					reads: ['training'],
					options: [option],
					whenMissing: 'ask',
					key: (raw) => (raw.training ? { key: raw.training, display: raw.training } : null),
					find: (key) => (key === 'CPR' ? { kind: 'one', option } : { kind: 'none' })
				}
			},
			review({ values, parseDate }) {
				const date = parseDate(values.result);
				return date
					? { outcome: 'new', key: values.person, change: { date } }
					: { outcome: 'fix', problems: [{ field: 'result', message: 'Invalid date' }] };
			},
			commitChunk: async () => ({ kind: 'unconfirmed' }),
			exit: { href: '/', label: 'Back' }
		});
		const source = new ExcelJS.Workbook();
		source.properties.date1904 = true;
		source.addWorksheet('Roster').addRows([
			['Person', 'CPR'],
			['Smith', 45046]
		]);
		const loaded = await readImportFile(new File([await writeWorkbookBuffer(source)], 'wide.xlsx'));
		if (loaded.kind !== 'loaded') throw new Error('Source rejected');
		const file = loaded.file;
		const layout = detectLayout(file, lane);
		const rows = buildSourceRows(file, layout, lane);
		expect(reviewRows(rows, lane, new Map(), new Set(), new ReviewMemo()).rows[0]).toMatchObject({
			outcome: 'new',
			change: { date: '2027-05-01' }
		});
		const receipt = buildReceipt(
			[{ row: rows[0], reason: 'Skipped CPR' }],
			new Map(),
			new Map(rows.map((row) => [row.id, row])),
			null
		);
		const exported = await buildNotImported(file, layout, receipt);
		const retry = await readImportFile(new File([await writeWorkbookBuffer(exported)], 'retry.xlsx'));
		if (retry.kind !== 'loaded') throw new Error('Retry rejected');
		const retriedRows = buildSourceRows(retry.file, detectLayout(retry.file, lane), lane);
		expect(retriedRows.map((row) => row.raw.training)).toEqual(['CPR']);
		expect(reviewRows(retriedRows, lane, new Map(), new Set(), new ReviewMemo()).rows[0]).toMatchObject({
			outcome: 'new',
			change: { date: '2027-05-01' }
		});
	});
});
