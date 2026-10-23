import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { writeWorkbookBuffer } from '$lib/utils/workbook';
import { buildTrainingMatrixWorkbook, type TrainingMatrixWorkbookInput } from './trainingMatrixWorkbook';

const EXPORT_DATE = '2026-06-15';
const NOTICE =
	'Exported 2026-06-15. Colors reflect training status on this date. These are fixed colors, not Excel conditional formatting. They will not update as time passes or when dates change.';

function person(id: string, lastName: string, firstName: string, clinicRole = 'NCO'): Personnel {
	return { id, lastName, firstName, clinicRole, rank: 'SPC', mos: '68W', groupId: 'alpha', groupName: 'Alpha' };
}

function type(id: string, name: string, sortOrder: number, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name,
		sortOrder,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#22c55e',
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function record(
	personnelId: string,
	trainingTypeId: string,
	completionDate: string | null,
	expirationDate: string | null
): PersonnelTraining {
	return {
		id: `${personnelId}:${trainingTypeId}`,
		personnelId,
		trainingTypeId,
		completionDate,
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

function addDays(date: string, days: number): string {
	const next = new Date(`${date}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
}

async function exportSheet(input: Omit<TrainingMatrixWorkbookInput, 'exportDate'>): Promise<ExcelJS.Worksheet> {
	const workbook = await buildTrainingMatrixWorkbook({ ...input, exportDate: EXPORT_DATE });
	const parsed = new ExcelJS.Workbook();
	await parsed.xlsx.load(
		Buffer.from(await writeWorkbookBuffer(workbook)) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
	);
	return parsed.getWorksheet('Training Matrix')!;
}

function cellColors(sheet: ExcelJS.Worksheet, address: string): { fill: unknown; font: unknown } {
	const cell = sheet.getCell(address);
	return { fill: (cell.fill as ExcelJS.FillPattern).fgColor?.argb, font: cell.font?.color?.argb };
}

/** One person, one expiring type; person i of the input lands on sheet row i + 3 in column D. */
async function expiryColors(daysFromExport: number[], typeOverrides: Partial<TrainingType> = {}): Promise<unknown[]> {
	const people = daysFromExport.map((_, index) => person(`p${index}`, `Person${String(index).padStart(2, '0')}`, 'A'));
	const sheet = await exportSheet({
		personnel: people,
		trainingTypes: [type('annual', 'Annual', 0, typeOverrides)],
		trainings: daysFromExport.map((days, index) =>
			record(`p${index}`, 'annual', '2020-01-01', addDays(EXPORT_DATE, days))
		)
	});
	return daysFromExport.map((_, index) => cellColors(sheet, `D${index + 3}`).fill);
}

describe('Training matrix workbook', () => {
	it('exports one alphabetical row per person with all globally ordered types and literal recorded dates or completion states', async () => {
		const sheet = await exportSheet({
			personnel: [
				person('baker', 'Baker', 'Blair'),
				person('zoe', 'Able', 'Zoe', 'Medic'),
				person('avery', 'Able', 'Avery')
			],
			trainingTypes: [
				type('exempted', 'Exemptible', 7, { canBeExempted: true, exemptPersonnelIds: ['avery'] }),
				type('optional', 'Optional', 6, { isOptional: true }),
				type('incomplete', 'Incomplete', 5),
				type('expiry', 'Clearance', 4, { expirationDateOnly: true, expirationMonths: null, isOptional: true }),
				type('orientation', 'Orientation', 3, { expirationMonths: null, isOptional: true }),
				type('annual', 'Annual', 2),
				type('targeted', 'Targeted', 1, { excludedRoles: ['NCO'] }),
				type('formula', '=HYPERLINK("https://example.test","Course")', 0)
			],
			trainings: [
				record('avery', 'annual', '2020-01-15', '2021-01-15'),
				record('baker', 'annual', '2026-01-20', '2027-01-20'),
				record('avery', 'targeted', '2026-02-01', '2027-02-01'),
				record('avery', 'exempted', '2026-03-01', '2027-03-01'),
				record('avery', 'orientation', null, null),
				record('baker', 'orientation', '2024-06-10', null),
				record('avery', 'expiry', null, '2027-04-10'),
				record('baker', 'expiry', '2024-01-01', '2027-05-10'),
				record('avery', 'incomplete', null, '2027-07-01'),
				record('baker', 'optional', null, null),
				record('foreign', 'annual', '2026-09-01', '2027-09-01')
			]
		});
		const rows: unknown[][] = [];
		sheet.eachRow((row, rowNumber) => {
			if (rowNumber > 1) rows.push((row.values as unknown[]).slice(1));
		});
		expect(rows).toEqual([
			[
				'Name',
				'Rank',
				'Group',
				'=HYPERLINK("https://example.test","Course")',
				'Targeted',
				'Annual',
				'Orientation (completion only)',
				'Clearance (expiration only)',
				'Incomplete',
				'Optional',
				'Exemptible'
			],
			[
				'Able, Avery',
				'SPC',
				'Alpha',
				'missing',
				'2026-02-01',
				'2020-01-15',
				'completed (no date)',
				'2027-04-10',
				'missing',
				'not required',
				'exempt'
			],
			[
				'Able, Zoe',
				'SPC',
				'Alpha',
				'missing',
				'missing',
				'missing',
				'not required',
				'not required',
				'missing',
				'not required',
				'missing'
			],
			[
				'Baker, Blair',
				'SPC',
				'Alpha',
				'missing',
				'not required',
				'2026-01-20',
				'2024-06-10',
				'2027-05-10',
				'missing',
				'not required',
				'missing'
			]
		]);
		expect(sheet.getCell('D2').type).toBe(ExcelJS.ValueType.String);
	});

	it('keeps an empty authorized roster empty even when records exist', async () => {
		const sheet = await exportSheet({
			personnel: [],
			trainingTypes: [type('annual', 'Annual', 0)],
			trainings: [record('hidden', 'annual', '2026-01-01', '2027-01-01')]
		});
		expect(sheet.getSheetValues().slice(2)).toEqual([[undefined, 'Name', 'Rank', 'Group', 'Annual']]);
	});

	it('puts a merged dated notice above a styled header and freezes both', async () => {
		const sheet = await exportSheet({
			personnel: [person('avery', 'Able', 'Avery')],
			trainingTypes: [type('annual', 'Annual', 0)],
			trainings: []
		});
		expect(sheet.getCell('A1').value).toBe(NOTICE);
		expect(sheet.getCell('A1').alignment?.wrapText).toBe(true);
		expect(sheet.model.merges).toEqual(['A1:D1']);
		expect(sheet.getRow(2).values).toEqual([undefined, 'Name', 'Rank', 'Group', 'Annual']);
		expect(sheet.getCell('A2').font?.bold).toBe(true);
		expect(cellColors(sheet, 'A2').fill).toBe('FFE8E8E8');
		expect(sheet.views).toMatchObject([{ state: 'frozen', ySplit: 2 }]);
		expect(sheet.getCell('A3').value).toBe('Able, Avery');
	});

	it('applies the fixed fill and font of each of the seven statuses to the exported cell', async () => {
		const sheet = await exportSheet({
			personnel: [person('avery', 'Able', 'Avery')],
			trainingTypes: [
				type('current', 'Current', 0),
				type('yellow', 'Yellow', 1),
				type('orange', 'Orange', 2),
				type('expired', 'Expired', 3),
				type('missing', 'Missing', 4),
				type('notRequired', 'Not required', 5, { excludedRoles: ['NCO'] }),
				type('exempt', 'Exempt', 6, { canBeExempted: true, exemptPersonnelIds: ['avery'] })
			],
			trainings: [
				record('avery', 'current', '2026-01-01', '2027-01-01'),
				record('avery', 'yellow', '2026-01-01', '2026-07-20'),
				record('avery', 'orange', '2026-01-01', '2026-06-20'),
				record('avery', 'expired', '2025-01-01', '2026-06-01')
			]
		});
		expect(sheet.getRow(3).values).toEqual([
			undefined,
			'Able, Avery',
			'SPC',
			'Alpha',
			'2026-01-01',
			'2026-01-01',
			'2026-01-01',
			'2025-01-01',
			'missing',
			'not required',
			'exempt'
		]);
		expect(['D3', 'E3', 'F3', 'G3', 'H3', 'I3', 'J3'].map((address) => cellColors(sheet, address))).toEqual([
			{ fill: 'FFDCFCE7', font: 'FF166534' },
			{ fill: 'FFFEF9C3', font: 'FF854D0E' },
			{ fill: 'FFFFEDD5', font: 'FF9A3412' },
			{ fill: 'FFFEE2E2', font: 'FF991B1B' },
			{ fill: 'FFF3F4F6', font: 'FF4B5563' },
			{ fill: 'FFFFFFFF', font: 'FF6B7280' },
			{ fill: 'FFE0F2FE', font: 'FF075985' }
		]);
	});

	it('colors an undated completion-only record current and an expiration-only record by its stored date', async () => {
		const sheet = await exportSheet({
			personnel: [person('avery', 'Able', 'Avery')],
			trainingTypes: [
				type('orientation', 'Orientation', 0, { expirationMonths: null }),
				type('clearance', 'Clearance', 1, { expirationDateOnly: true, expirationMonths: null })
			],
			trainings: [record('avery', 'orientation', null, null), record('avery', 'clearance', null, '2026-06-01')]
		});
		expect([sheet.getCell('D3').value, sheet.getCell('E3').value]).toEqual(['completed (no date)', '2026-06-01']);
		expect([cellColors(sheet, 'D3').fill, cellColors(sheet, 'E3').fill]).toEqual(['FFDCFCE7', 'FFFEE2E2']);
	});

	it('uses the export date for the default warning boundaries', async () => {
		expect(await expiryColors([-1, 0, 30, 31, 60, 61])).toEqual([
			'FFFEE2E2',
			'FFFFEDD5',
			'FFFFEDD5',
			'FFFEF9C3',
			'FFFEF9C3',
			'FFDCFCE7'
		]);
	});

	it('honors a custom warning threshold of the training type', async () => {
		expect(await expiryColors([10, 11, 20, 21], { warningDaysOrange: 10, warningDaysYellow: 20 })).toEqual([
			'FFFFEDD5',
			'FFFEF9C3',
			'FFFEF9C3',
			'FFDCFCE7'
		]);
	});

	it('colors by the stored expiration date, not the exported completion date', async () => {
		const sheet = await exportSheet({
			personnel: [person('avery', 'Able', 'Avery')],
			trainingTypes: [type('annual', 'Annual', 0)],
			trainings: [record('avery', 'annual', '2020-01-01', '2027-06-15')]
		});
		expect([sheet.getCell('D3').value, cellColors(sheet, 'D3').fill]).toEqual(['2020-01-01', 'FFDCFCE7']);
	});

	it('writes fixed styles only, with no conditional formatting or formulas', async () => {
		const sheet = await exportSheet({
			personnel: [person('avery', 'Able', 'Avery')],
			trainingTypes: [type('annual', 'Annual', 0)],
			trainings: [record('avery', 'annual', '2026-01-01', '2026-06-20')]
		});
		expect((sheet as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings).toEqual([]);
		expect(sheet.getCell('D3').type).toBe(ExcelJS.ValueType.String);
	});
});
