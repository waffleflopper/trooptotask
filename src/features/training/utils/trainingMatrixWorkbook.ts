import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingStatus, TrainingType } from '../training.types';
import { addTableSheet, createWorkbook, type Workbook, type WorkbookRow } from '$lib/utils/workbook';
import { getTrainingStatus } from './trainingStatus';
import { filterColumnsByView } from './viewFiltering';

export interface TrainingMatrixWorkbookInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	trainings: PersonnelTraining[];
	/** Local `YYYY-MM-DD` captured once when the export starts; drives every status, the notice and the filename. */
	exportDate: string;
}

interface TrainingCell {
	value: string;
	status: TrainingStatus;
}

const STATUS_STYLES = {
	current: { fill: 'FFDCFCE7', font: 'FF166534' },
	'warning-yellow': { fill: 'FFFEF9C3', font: 'FF854D0E' },
	'warning-orange': { fill: 'FFFFEDD5', font: 'FF9A3412' },
	expired: { fill: 'FFFEE2E2', font: 'FF991B1B' },
	'not-completed': { fill: 'FFF3F4F6', font: 'FF4B5563' },
	'not-required': { fill: 'FFFFFFFF', font: 'FF6B7280' },
	exempt: { fill: 'FFE0F2FE', font: 'FF075985' }
} as const satisfies Record<TrainingStatus, { fill: string; font: string }>;

const NOTICE_LINE_HEIGHT = 15;
const FIXED_COLUMN_COUNT = 3;

function exportNotice(exportDate: string): string {
	return `Exported ${exportDate}. Colors reflect training status on this date. These are fixed colors, not Excel conditional formatting. They will not update as time passes or when dates change.`;
}

function trainingCell(
	person: Personnel,
	type: TrainingType,
	training: PersonnelTraining | undefined,
	exportDate: string
): TrainingCell {
	const { status } = getTrainingStatus(training, type, person, exportDate);
	if (status === 'exempt') return { value: 'exempt', status };
	const date = type.expirationDateOnly ? training?.expirationDate : training?.completionDate;
	if (date) return { value: date, status };
	if (status === 'current') return { value: 'completed (no date)', status };
	return { value: status === 'not-required' ? 'not required' : 'missing', status };
}

export async function buildTrainingMatrixWorkbook(input: TrainingMatrixWorkbookInput): Promise<Workbook> {
	const types = filterColumnsByView(input.trainingTypes, null);
	const trainings = new Map(
		input.trainings.map((training) => [`${training.personnelId}:${training.trainingTypeId}`, training])
	);
	const personnel = [...input.personnel].sort(
		(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
	);
	const cells = personnel.map((person) =>
		types.map((type) => trainingCell(person, type, trainings.get(`${person.id}:${type.id}`), input.exportDate))
	);
	const rows: WorkbookRow[] = personnel.map((person, index) => ({
		name: `${person.lastName}, ${person.firstName}`,
		rank: person.rank,
		group: person.groupName || 'Unassigned',
		...Object.fromEntries(types.map((type, column) => [`training_${type.id}`, cells[index][column].value]))
	}));
	const columns = [
		{ header: 'Name', key: 'name', width: 24 },
		{ header: 'Rank', key: 'rank', width: 12 },
		{ header: 'Group', key: 'group', width: 18 },
		...types.map((type) => ({
			header: type.expirationDateOnly
				? `${type.name} (expiration only)`
				: type.expirationMonths === null
					? `${type.name} (completion only)`
					: type.name,
			key: `training_${type.id}`,
			width: 28
		}))
	];
	const workbook = await createWorkbook();
	const sheet = addTableSheet(workbook, { name: 'Training Matrix', columns, rows, freezeHeader: false });

	sheet.spliceRows(1, 0, [exportNotice(input.exportDate)]);
	sheet.mergeCells(1, 1, 1, columns.length);
	const notice = sheet.getRow(1);
	notice.getCell(1).alignment = { wrapText: true, vertical: 'top' };
	const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
	notice.height = Math.ceil(exportNotice(input.exportDate).length / totalWidth) * NOTICE_LINE_HEIGHT;
	sheet.views = [{ state: 'frozen', ySplit: 2 }];

	cells.forEach((rowCells, rowIndex) =>
		rowCells.forEach(({ status }, column) => {
			const { fill, font } = STATUS_STYLES[status];
			const cell = sheet.getCell(rowIndex + 3, FIXED_COLUMN_COUNT + column + 1);
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
			cell.font = { color: { argb: font } };
		})
	);
	return workbook;
}
