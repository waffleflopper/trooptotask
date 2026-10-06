import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { addTableSheet, createWorkbook, type Workbook, type WorkbookRow } from '$lib/utils/workbook';
import { getTrainingStatus } from './trainingStatus';
import { filterColumnsByView } from './viewFiltering';

export interface TrainingMatrixWorkbookInput {
	personnel: Personnel[];
	trainingTypes: TrainingType[];
	trainings: PersonnelTraining[];
}

function trainingCell(person: Personnel, type: TrainingType, training: PersonnelTraining | undefined): string {
	const { status } = getTrainingStatus(training, type, person);
	if (status === 'exempt') return 'exempt';
	const date = type.expirationDateOnly ? training?.expirationDate : training?.completionDate;
	if (date) return date;
	if (status === 'current') return 'completed (no date)';
	return status === 'not-required' ? 'not required' : 'missing';
}

export async function buildTrainingMatrixWorkbook(input: TrainingMatrixWorkbookInput): Promise<Workbook> {
	const types = filterColumnsByView(input.trainingTypes, null);
	const trainings = new Map(
		input.trainings.map((training) => [`${training.personnelId}:${training.trainingTypeId}`, training])
	);
	const personnel = [...input.personnel].sort(
		(a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
	);
	const rows: WorkbookRow[] = personnel.map((person) => ({
		name: `${person.lastName}, ${person.firstName}`,
		rank: person.rank,
		group: person.groupName || 'Unassigned',
		...Object.fromEntries(
			types.map((type) => [`training_${type.id}`, trainingCell(person, type, trainings.get(`${person.id}:${type.id}`))])
		)
	}));
	const workbook = await createWorkbook();
	addTableSheet(workbook, {
		name: 'Training Matrix',
		columns: [
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
		],
		rows
	});
	return workbook;
}
