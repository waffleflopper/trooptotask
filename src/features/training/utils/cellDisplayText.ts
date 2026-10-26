import type { TrainingStatusInfo } from './trainingStatus';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jun ’27" for a date-only string (YYYY-MM-DD). */
function formatMonthYear(dateOnly: string): string | null {
	const [year, month] = dateOnly.split('-');
	const name = SHORT_MONTHS[Number(month) - 1];
	return year && name ? `${name} ’${year.slice(-2)}` : null;
}

type RenewalKind = Pick<TrainingType, 'expirationMonths' | 'expirationDateOnly'>;

/** True for a type that never lapses; a stored expiration date from before it became so no longer counts. */
export function neverExpires(type: RenewalKind): boolean {
	return !type.expirationDateOnly && type.expirationMonths === null;
}

/** What a matrix cell shows. A current cell shows the month it lapses, or the completion month when it never does. */
export function getCellDisplayText(
	statusInfo: TrainingStatusInfo,
	training: PersonnelTraining | undefined,
	type: RenewalKind
): string {
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
			const date = neverExpires(type)
				? training?.completionDate
				: (training?.expirationDate ?? training?.completionDate);
			return (date && formatMonthYear(date)) || statusInfo.label;
		}
	}
}

/** The renewal interval under a column name. */
export function getColumnIntervalLabel(type: RenewalKind): string {
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
