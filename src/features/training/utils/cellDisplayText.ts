import type { TrainingStatusInfo } from './trainingStatus';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jun ’27" for a date-only string (YYYY-MM-DD). */
function formatMonthYear(dateOnly: string): string | null {
	const [year, month] = dateOnly.split('-');
	const name = SHORT_MONTHS[Number(month) - 1];
	return year && name ? `${name} ’${year.slice(-2)}` : null;
}

/** What a matrix cell shows. A current cell shows the month it lapses, or the completion month when it never does. */
export function getCellDisplayText(statusInfo: TrainingStatusInfo, training: PersonnelTraining | undefined): string {
	switch (statusInfo.status) {
		case 'exempt':
			return 'Exempt';
		case 'not-required':
			return '—';
		case 'not-completed':
			return 'No record';
		case 'expired':
			return 'Expired';
		case 'warning-yellow':
		case 'warning-orange':
			return statusInfo.daysUntilExpiration === null ? statusInfo.label : `${statusInfo.daysUntilExpiration}d`;
		case 'current': {
			const date = training?.expirationDate ?? training?.completionDate;
			return (date && formatMonthYear(date)) || statusInfo.label;
		}
	}
}

/** The renewal interval under a column name. */
export function getColumnIntervalLabel(type: Pick<TrainingType, 'expirationMonths' | 'expirationDateOnly'>): string {
	if (type.expirationDateOnly) return 'Date';
	return type.expirationMonths === null ? 'No expiry' : `${type.expirationMonths} mo`;
}

/** The status spoken for a cell, in the words the cell shows: voice control says what it sees. */
export function getCellStatusLabel(statusInfo: TrainingStatusInfo): string {
	switch (statusInfo.status) {
		case 'not-completed':
			return 'No record';
		case 'not-required':
			return 'Not required';
		default:
			return statusInfo.label;
	}
}
