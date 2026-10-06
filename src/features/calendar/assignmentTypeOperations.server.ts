import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarCatalogPorts,
	type CalendarCatalogDeletionPorts
} from '$lib/server/core/useCases/calendarPolicy';
import { assignmentTypeCreateInput, assignmentTypeUpdateInput } from './calendarPersistenceMapping.server';

const action = CALENDAR_POLICY_ACTIONS.configureAssignmentTypes;
const resource = { kind: 'organization' } as const;

export async function createAssignmentType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = assignmentTypeCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.createAssignmentType(parsed.data);
	ctx.audit.log({
		action: 'assignment_type.created',
		resourceType: 'assignment_type',
		resourceId: row.id
	});
	return row;
}

export async function updateAssignmentType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = assignmentTypeUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.updateAssignmentType(id, patch);
	ctx.audit.log({ action: 'assignment_type.updated', resourceType: 'assignment_type', resourceId: id });
	return row;
}

export async function deleteAssignmentType(ctx: CalendarCatalogDeletionPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.calendarCatalogs.deleteAssignmentType(id);
	ctx.audit.log({ action: 'assignment_type.deleted', resourceType: 'assignment_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Assignment Type Deleted',
		message: 'An assignment type was deleted.'
	});
}
