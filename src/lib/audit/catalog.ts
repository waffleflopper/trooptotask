import { calendarKinds } from './kinds/calendar';
import { calendarAppKinds } from './kinds/calendarApp';
import { criticalTaskKinds } from './kinds/criticalTasks';
import { onboardingKinds } from './kinds/onboarding';
import { organizationKinds } from './kinds/organization';
import { peopleKinds } from './kinds/people';
import { personRecordKinds } from './kinds/personRecords';
import { ratingSchemeKinds } from './kinds/ratingScheme';
import { trainingKinds } from './kinds/training';
import type { AuditKind, AuditSentenceContext, SavedAuditEntry } from './kinds/shared';

export type { AuditKind, AuditSentenceContext, SavedAuditEntry };

/** Every cataloged kind. A kind written here is read only from its saved labels. */
export const AUDIT_KINDS = {
	...calendarKinds,
	...calendarAppKinds,
	...organizationKinds,
	...peopleKinds,
	...trainingKinds,
	...criticalTaskKinds,
	...ratingSchemeKinds,
	...onboardingKinds,
	...personRecordKinds
} as const satisfies Record<string, AuditKind>;

export type AuditKindName = keyof typeof AUDIT_KINDS;

export function auditKindOf(action: string): AuditKind | undefined {
	return Object.hasOwn(AUDIT_KINDS, action) ? AUDIT_KINDS[action as AuditKindName] : undefined;
}

/** The cataloged sentence for a saved entry, or null for an uncataloged action or an entry missing what its kind requires. */
export function catalogSentence(entry: SavedAuditEntry, context: AuditSentenceContext): string | null {
	return auditKindOf(entry.action)?.read(entry, context) ?? null;
}

/**
 * One line for entries a single action wrote: "Added 3 availability entries, deleted 1 availability entry".
 * `partial` marks an action whose older entries were not loaded, so each count is a floor.
 */
export function batchSentence(actions: readonly string[], { partial = false } = {}): string {
	const counts = new Map<string, number>();
	for (const action of actions) counts.set(action, (counts.get(action) ?? 0) + 1);
	return [...counts]
		.map(([action, count], index) => {
			const kind = auditKindOf(action)?.batch ?? { verb: 'Recorded', one: 'entry', many: 'entries' };
			const verb = index === 0 ? kind.verb : kind.verb.toLowerCase();
			return `${verb} ${partial ? 'at least ' : ''}${count.toLocaleString('en-US')} ${count === 1 ? kind.one : kind.many}`;
		})
		.join(', ');
}
