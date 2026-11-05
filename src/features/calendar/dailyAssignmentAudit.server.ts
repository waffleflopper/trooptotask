import { randomUUID } from 'node:crypto';
import type { CalendarWritePorts } from './calendarPolicy.server';

type AssignmentAuditPorts = Pick<CalendarWritePorts, 'audit' | 'calendarCatalogs' | 'groups'>;

/** A roster fill writes a year of days, so entries go out in groups rather than one request at a time. */
const WRITES_AT_ONCE = 20;

const UNKNOWN_TYPE = 'Unknown assignment type';

export interface AssignmentAuditChange {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
	kind: 'created' | 'updated' | 'cleared';
}

export async function auditAssignmentChanges(
	ctx: AssignmentAuditPorts,
	changes: AssignmentAuditChange[]
): Promise<void> {
	if (changes.length === 0) return;
	const types = new Map((await ctx.calendarCatalogs.listAssignmentTypes()).map((type) => [type.id, type]));
	const needsGroups = changes.some(
		(change) => change.kind !== 'cleared' && types.get(change.assignmentTypeId)?.assignTo === 'group'
	);
	const groups = needsGroups
		? new Map((await ctx.groups.listCatalog()).map((group) => [group.id, group.name]))
		: new Map<string, string>();
	const batchId = changes.length > 1 ? randomUUID() : undefined;
	const entryOf = (change: AssignmentAuditChange) => {
		const type = types.get(change.assignmentTypeId) ?? { name: UNKNOWN_TYPE, assignTo: 'personnel' as const };
		const details = { date: change.date };
		const base = { resourceType: 'daily_assignment', record: type.name, batchId };
		if (change.kind === 'cleared') return { ...base, action: 'daily_assignment.cleared', details };
		if (type.assignTo === 'group') {
			return {
				...base,
				action: `daily_assignment.${change.kind}`,
				details: { ...details, group: groups.get(change.assigneeId) ?? 'Unknown Group' }
			};
		}
		return {
			...base,
			action: `daily_assignment.${change.kind}`,
			subject: { personnelId: change.assigneeId },
			details: { ...details, group: null }
		};
	};
	for (let at = 0; at < changes.length; at += WRITES_AT_ONCE) {
		await Promise.all(changes.slice(at, at + WRITES_AT_ONCE).map((change) => ctx.audit.log(entryOf(change))));
	}
}

/** The type's name as saved in an entry. A type deleted in the meantime reads as unknown. */
export async function assignmentTypeLabel(
	ctx: { calendarCatalogs: Pick<CalendarWritePorts['calendarCatalogs'], 'listAssignmentTypes'> },
	assignmentTypeId: string
): Promise<string> {
	const types = await ctx.calendarCatalogs.listAssignmentTypes();
	return types.find((type) => type.id === assignmentTypeId)?.name ?? UNKNOWN_TYPE;
}
