import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { Personnel } from '$lib/types';
import type { TrainingType } from '../contracts';
import type { PivotRow } from './reportCalculations';
import { buildTrainingReportWorkbook } from './trainingReportWorkbook';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

const person: Personnel = {
	id: 'able',
	rank: 'SGT',
	lastName: "O'Brien",
	firstName: 'Amy',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'alpha',
	groupName: 'Alpha'
};
const types: TrainingType[] = [
	{
		id: 'required',
		name: 'Required',
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
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false
	}
];

async function parsedSheet(rows: PivotRow[], selectedTypes = types) {
	const workbook = await buildTrainingReportWorkbook(rows, selectedTypes);
	const parsed = new ExcelJS.Workbook();
	await parsed.xlsx.load((await workbook.xlsx.writeBuffer()) as WorkbookLoadBuffer);
	return parsed.getWorksheet('Training Report')!;
}

describe('Training report workbook', () => {
	it('preserves person information and saved status/date labels as native cells', async () => {
		const selectedTypes = [...types, { ...types[0], id: 'targeted', name: 'Targeted' }];
		const sheet = await parsedSheet(
			[
				{
					person,
					cells: new Map([
						['required', { status: 'current', label: 'Current', date: '2027-09-22' }],
						['targeted', { status: 'warning-orange', label: 'Expiring', date: '2026-10-14' }]
					])
				}
			],
			selectedTypes
		);

		expect(sheet.getRow(1).values).toEqual([
			undefined,
			'Name',
			'Rank',
			'MOS',
			'Duty Role',
			'Group',
			'Required',
			'Targeted'
		]);
		expect(sheet.getRow(2).values).toEqual([
			undefined,
			"O'Brien, Amy",
			'SGT',
			'68W',
			'Medic',
			'Alpha',
			'Current (2027-09-22)',
			'Expiring (2026-10-14)'
		]);
	});

	it('exports only selected type columns and preserves undated statuses and missing cells', async () => {
		const rows: PivotRow[] = [
			{
				person,
				cells: new Map([
					['required', { status: 'exempt', label: 'Exempt', date: null }],
					['hidden', { status: 'expired', label: 'Expired', date: '2025-09-29' }]
				])
			},
			{ person: { ...person, id: 'baker', lastName: 'Baker' }, cells: new Map() }
		];
		const sheet = await parsedSheet(rows);

		expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Rank', 'MOS', 'Duty Role', 'Group', 'Required']);
		expect(sheet.getCell('F2').value).toBe('Exempt');
		expect(sheet.getCell('F3').text).toBe('');
	});

	it('retains workbook headers when the authorized result is empty', async () => {
		const sheet = await parsedSheet([]);
		expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Rank', 'MOS', 'Duty Role', 'Group', 'Required']);
		expect(sheet.getCell('A2').value).toBeNull();
	});
});
