import type { TrainingStatusInfo } from './trainingStatus';
import type { PersonnelTraining } from '$features/training/training.types';

/**
 * Returns the text to display inside a heatmap cell.
 * Date-based statuses show the relevant date; non-date statuses show short labels.
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
			return 'N/R';
		case 'not-completed':
			return 'Not Done';
		case 'current':
		case 'warning-yellow':
		case 'warning-orange':
		case 'expired': {
			if (expirationDateOnly) {
				return training?.expirationDate ?? 'Not Done';
			}
			return training?.completionDate ?? 'Current';
		}
	}
}
