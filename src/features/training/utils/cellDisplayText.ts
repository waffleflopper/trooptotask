import type { TrainingStatusInfo } from './trainingStatus';
import type { PersonnelTraining } from '$features/training/training.types';

function formatCompactTrainingDate(date: string | null | undefined): string | null {
	if (!date) return null;

	const [year, month] = date.split('-');
	if (!year || !month) return date;
	return `${month}/${year}`;
}

export function formatTrainingCellText(label: string, date: string | null | undefined): string {
	const compactDate = formatCompactTrainingDate(date);
	return compactDate ? `${label} ${compactDate}` : label;
}

/**
 * Returns the text to display inside a heatmap cell.
 * Date-based statuses show a compact inline status + date; non-date statuses show short labels.
 */
export function getCellDisplayText(
	statusInfo: TrainingStatusInfo,
	training: PersonnelTraining | undefined,
	expirationDateOnly: boolean
): string {
	switch (statusInfo.status) {
		case 'exempt':
			return 'Exempt';
		case 'not-required':
			return 'N/A';
		case 'not-completed':
			return 'Not Done';
		case 'current':
		case 'warning-yellow':
		case 'warning-orange':
		case 'expired': {
			const relevantDate = expirationDateOnly
				? training?.expirationDate
				: (training?.expirationDate ?? training?.completionDate);
			return formatTrainingCellText(statusInfo.label, relevantDate);
		}
	}
}
