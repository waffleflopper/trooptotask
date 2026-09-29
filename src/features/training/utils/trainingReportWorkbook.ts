import type { TrainingType } from '../contracts';
import type { PivotRow } from './reportCalculations';
import { addTableSheet, createWorkbook, downloadWorkbook, type Workbook, type WorkbookRow } from '$lib/export/workbook';

function trainingReportWorkbookColumns(types: TrainingType[]) {
	return [
		{ header: 'Name', key: 'name', width: 24 },
		{ header: 'Rank', key: 'rank', width: 12 },
		{ header: 'MOS', key: 'mos', width: 12 },
		{ header: 'Duty Role', key: 'dutyRole', width: 20 },
		{ header: 'Group', key: 'group', width: 18 },
		...types.map((type) => ({ header: type.name, key: `training_${type.id}`, width: 20 }))
	];
}

function trainingReportWorkbookRows(rows: PivotRow[], types: TrainingType[]): WorkbookRow[] {
	return rows.map((row) => {
		const workbookRow: WorkbookRow = {
			name: `${row.person.lastName}, ${row.person.firstName}`,
			rank: row.person.rank,
			mos: row.person.mos,
			dutyRole: row.person.clinicRole,
			group: row.person.groupName
		};

		for (const type of types) {
			const cell = row.cells.get(type.id);
			const datePart = cell?.date ? ` (${cell.date})` : '';
			workbookRow[`training_${type.id}`] = cell ? `${cell.label}${datePart}` : '';
		}

		return workbookRow;
	});
}

export async function buildTrainingReportWorkbook(rows: PivotRow[], types: TrainingType[]): Promise<Workbook> {
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Training Report',
		columns: trainingReportWorkbookColumns(types),
		rows: trainingReportWorkbookRows(rows, types)
	});
	return workbook;
}

export async function exportTrainingReportWorkbook(
	rows: PivotRow[],
	types: TrainingType[],
	filename = 'training-report.xlsx'
): Promise<void> {
	await downloadWorkbook(await buildTrainingReportWorkbook(rows, types), filename);
}
