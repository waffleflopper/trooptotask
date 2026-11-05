import { randomUUID } from 'node:crypto';
import type { CalendarWritePorts } from './calendarPolicy.server';

const UNKNOWN_TYPE = 'Unknown assignment type';

export interface AssignmentAuditChange {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
	kind: 'created' | 'updated' | 'cleared';
}

export async function auditAssignmentChanges(ctx: CalendarWritePorts, changes: AssignmentAuditChange[]): Promise<void> {
	if (changes.length === 0) return;
	const types = new Map((await ctx.calendarCatalogs.listAssignmentTypes()).map((type) => [type.id, type]));
	const needsGroups = changes.some(
		(change) => change.kind !== 'cleared' && types.get(change.assignmentTypeId)?.assignTo === 'group'
	);
	const groups = needsGroups
		? new Map((await ctx.groups.listCatalog()).map((group) => [group.id, group.name]))
		: new Map<string, string>();
	const batchId = changes.length > 1 ? randomUUID() : undefined;
	for (const change of changes) {
		const type = types.get(change.assignmentTypeId) ?? { name: UNKNOWN_TYPE, assignTo: 'personnel' as const };
		const details = { date: change.date };
		const base = { resourceType: 'daily_assignment', record: type.name, batchId };
		if (change.kind === 'cleared') {
			await ctx.audit.log({ ...base, action: 'daily_assignment.cleared', details });
		} else if (type.assignTo === 'group') {
			await ctx.audit.log({
				...base,
				action: `daily_assignment.${change.kind}`,
				details: { ...details, group: groups.get(change.assigneeId) ?? 'Unknown Group' }
			});
		} else {
			await ctx.audit.log({
				...base,
				action: `daily_assignment.${change.kind}`,
				subject: { personnelId: change.assigneeId },
				details: { ...details, group: null }
			});
		}
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
