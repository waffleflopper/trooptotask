import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarCatalogPorts,
	type CalendarCatalogDeletionPorts
} from './calendarPolicy.server';
import { statusTypeCreateInput, statusTypeUpdateInput } from './calendarPersistenceMapping.server';

const action = CALENDAR_POLICY_ACTIONS.configureStatusTypes;
const resource = { kind: 'organization' } as const;

export async function createStatusType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = statusTypeCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.createStatusType(parsed.data);
	ctx.audit.log({
		action: 'status_type.created',
		resourceType: 'status_type',
		resourceId: row.id
	});
	return row;
}

export async function updateStatusType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = statusTypeUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.updateStatusType(id, patch);
	if (!row) throw error(404, 'That status type is no longer available.');
	ctx.audit.log({ action: 'status_type.updated', resourceType: 'status_type', resourceId: id });
	return row;
}

export async function deleteStatusType(ctx: CalendarCatalogDeletionPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	if (!(await ctx.calendarCatalogs.deleteStatusType(id))) return;
	ctx.audit.log({ action: 'status_type.deleted', resourceType: 'status_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Status Type Deleted',
		message: 'A status type was deleted.'
	});
}
