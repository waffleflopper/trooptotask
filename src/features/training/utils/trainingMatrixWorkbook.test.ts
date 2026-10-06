import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { writeWorkbookBuffer } from '$lib/utils/workbook';
import { buildTrainingMatrixWorkbook } from './trainingMatrixWorkbook';

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

describe('Training matrix workbook', () => {
	it('exports one alphabetical row per person with all globally ordered types and literal recorded dates or completion states', async () => {
		const workbook = await buildTrainingMatrixWorkbook({
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
		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(
			Buffer.from(await writeWorkbookBuffer(workbook)) as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]
		);
		expect(parsed.worksheets.map((sheet) => sheet.name)).toEqual(['Training Matrix']);
		const sheet = parsed.getWorksheet('Training Matrix')!;
		const rows: unknown[][] = [];
		sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
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
		expect(sheet.getCell('D1').type).toBe(ExcelJS.ValueType.String);
	});

	it('keeps an empty authorized roster empty even when records exist', async () => {
		const workbook = await buildTrainingMatrixWorkbook({
			personnel: [],
			trainingTypes: [type('annual', 'Annual', 0)],
			trainings: [record('hidden', 'annual', '2026-01-01', '2027-01-01')]
		});
		const sheet = workbook.getWorksheet('Training Matrix')!;
		expect(sheet.getSheetValues()).toEqual([undefined, [undefined, 'Name', 'Rank', 'Group', 'Annual']]);
	});
});
