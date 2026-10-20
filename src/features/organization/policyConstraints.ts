export const ARCHIVE_RETENTION_CONSTRAINT = { min: 1, max: 120, unit: 'months' } as const;
export const LOSS_WARNING_CONSTRAINT = { min: 1, max: 365, unit: 'days' } as const;
export const TRAINING_READINESS_GOAL_CONSTRAINT = { min: 1, max: 100, unit: 'percent' } as const;
export const STRENGTH_FLOOR_CONSTRAINT = { min: 1, max: 100, unit: 'percent' } as const;

export const DEFAULT_ARCHIVE_RETENTION_MONTHS = 36;
export const DEFAULT_LOSS_WARNING_WINDOW_DAYS = 180;
export const DEFAULT_TRAINING_READINESS_GOAL_PERCENT = 90;
export const DEFAULT_STRENGTH_FLOOR_PERCENT = 80;

/** A missing setting takes the default; a failed read is `null` (unavailable), never a guessed window. */
export function readLossWarningWindowDays(read: Promise<number | null | undefined>): Promise<number | null> {
	return read.then(
		(days) => days ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		() => null
	);
}
