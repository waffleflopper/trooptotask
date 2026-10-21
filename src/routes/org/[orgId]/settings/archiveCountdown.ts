import { retentionDeletionDate } from '$lib/utils/retentionCutoff';

export interface DeletionCountdown {
	label: string;
	/** Share of the retention period already passed, 0 to 1. */
	elapsed: number;
	/** Within 30 days of automatic deletion, or past it and waiting for the next cleanup run. */
	soon: boolean;
}

const DAY = 86_400_000;
const AVERAGE_MONTH_DAYS = 365.25 / 12;
const SOON_DAYS = 30;
const DAYS_LABEL_BELOW = 60;

/**
 * Days are counted to the 05:00 UTC cleanup run that deletes the person, so a day ends when a run starts.
 * Under 60 days the label counts days; from 60 on it rounds to whole months.
 */
export function deletionCountdown(archivedAt: string, retentionMonths: number, now: Date): DeletionCountdown {
	const archived = Date.parse(archivedAt);
	const deletes = retentionDeletionDate(archivedAt, retentionMonths).getTime();
	const daysLeft = Math.ceil((deletes - now.getTime()) / DAY);
	const elapsed = Math.min(1, Math.max(0, (now.getTime() - archived) / (deletes - archived)));
	return { label: countdownLabel(daysLeft), elapsed, soon: daysLeft <= SOON_DAYS };
}

function countdownLabel(daysLeft: number): string {
	if (daysLeft <= 0) return 'Due now';
	if (daysLeft < DAYS_LABEL_BELOW) return `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
	return `${Math.round(daysLeft / AVERAGE_MONTH_DAYS)} months`;
}
