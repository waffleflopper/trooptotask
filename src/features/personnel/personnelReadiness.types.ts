import type { ReadinessItemStatus, ReadinessProblemStatus } from '$lib/domain/readinessItem';
import type { LossTriggerType } from './upcomingLoss';

export interface PersonnelLossDate {
	date: string;
	daysRemaining: number;
}

export interface PersonnelLossReadiness {
	/** Null while the unit has Losses and awards off: the dates show with no window state. */
	windowDays: number | null;
	ets: PersonnelLossDate | null;
	deros: PersonnelLossDate | null;
	/** The nearest loss date inside the Organization's window and the day the Person entered it. */
	inWindow: { trigger: LossTriggerType; date: string; daysRemaining: number; enteredOn: string } | null;
}

/**
 * A source's result as the attention builder receives it: a value, a failed or denied read, or a
 * feature the unit turned off, which was not read and is not missing.
 */
export type ReadinessSourceResult<T> = { ok: true; value: T } | { ok: false; off?: true };

/** The fields the attention builder reads from each feature's item read. Features own the full shapes. */
export interface AttentionInput {
	training: ReadinessSourceResult<{
		items: Array<{
			typeId: string;
			name: string;
			status: ReadinessItemStatus;
			daysUntilExpiration: number | null;
			cycleMonths: number | null;
			applicability:
				| { kind: 'all' }
				| { kind: 'mos'; mos: string }
				| { kind: 'role'; role: string }
				| { kind: 'rank'; rank: string };
			completion: { completionDate: string | null; expirationDate: string | null } | null;
		}>;
	}>;
	criticalTasks: ReadinessSourceResult<{
		items: Array<{
			taskId: string;
			taskCode: string;
			name: string;
			status: ReadinessItemStatus;
			daysUntilExpiration: number | null;
			expirationDate: string | null;
			latest: { completedAt: string; validatedBy: string | null } | null;
		}>;
	}>;
	evaluation: ReadinessSourceResult<{
		entryId: string;
		evalType: string;
		reportTypeLabel: string | null;
		periodEnd: string;
		daysUntilThru: number;
		dueStatus: 'current' | 'due-60' | 'due-30' | 'overdue' | 'completed';
		phase: { label: string };
		rater: string | null;
	} | null>;
	loss: ReadinessSourceResult<PersonnelLossReadiness>;
	onboarding: ReadinessSourceResult<{ state: 'none' | 'in-progress' | 'complete' }>;
}

export type AttentionSource = keyof AttentionInput;

/** Where an attention row leads: an item's Readiness drawer, the Evals entry, or the Data sheet. */
export type AttentionTarget =
	| { tab: 'readiness'; item: { kind: 'training' | 'critical-task'; id: string } }
	| { tab: 'evals'; entryId: string }
	| { tab: 'data-sheet' };

interface AttentionItemBase {
	id: string;
	title: string;
	detail: string;
	dueDate: string | null;
	daysUntilDue: number | null;
	target: AttentionTarget;
}

export type AttentionItem =
	| (AttentionItemBase & { kind: 'training' | 'critical-task'; status: ReadinessProblemStatus })
	| (AttentionItemBase & { kind: 'evaluation'; status: 'due' })
	| (AttentionItemBase & { kind: 'loss'; status: 'upcoming' });

export type AttentionStatus = AttentionItem['status'];

type Checked<T> = ({ state: 'checked' } & T) | { state: 'failed' } | { state: 'off' };

export interface PersonnelAttention {
	/** Most urgent first. */
	items: AttentionItem[];
	/** Readiness tab badge: expired, missing and expiring training and critical-task items. */
	readinessBadge: { count: number; complete: boolean };
	checked: {
		training: Checked<{ currentCount: number }>;
		criticalTasks: Checked<{ currentCount: number; applicableCount: number }>;
		evaluation: Checked<object>;
		loss: Checked<object>;
		onboarding: Checked<{ status: 'none' | 'in-progress' | 'complete' }>;
	};
	failed: AttentionSource[];
}
