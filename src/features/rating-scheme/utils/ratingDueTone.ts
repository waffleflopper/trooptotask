import type { RatingDueStatus } from '../rating-scheme.types';

export interface RatingDueTone {
	text: string;
	/** Fill for the left rail of a row or sheet header. */
	rail: string;
	/** A 3 px inset edge on the first cell of a table row; it adds no width. */
	insetRail: string;
}

/** Readiness reads green, amber, orange, red; a completed entry is muted. */
export const ratingDueTone: Record<RatingDueStatus, RatingDueTone> = {
	current: {
		text: 'text-success-foreground',
		rail: 'bg-success',
		insetRail: 'shadow-[inset_3px_0_0_0_var(--color-success)]'
	},
	'due-60': {
		text: 'text-warning-foreground',
		rail: 'bg-warning',
		insetRail: 'shadow-[inset_3px_0_0_0_var(--color-warning)]'
	},
	'due-30': {
		text: 'text-expiring-foreground',
		rail: 'bg-expiring',
		insetRail: 'shadow-[inset_3px_0_0_0_var(--color-expiring)]'
	},
	overdue: {
		text: 'text-destructive-text',
		rail: 'bg-destructive',
		insetRail: 'shadow-[inset_3px_0_0_0_var(--color-destructive)]'
	},
	completed: {
		text: 'text-muted-foreground',
		rail: 'bg-border',
		insetRail: 'shadow-[inset_3px_0_0_0_var(--color-border)]'
	}
};
