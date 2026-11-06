import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarCatalogPorts,
	type CalendarCatalogDeletionPorts
} from './calendarPolicy.server';
import {
	statusTypeCreateInput,
	statusTypeOrderInput,
	statusTypeUpdateInput
} from './calendarPersistenceMapping.server';
import { issueMessage } from '$lib/utils/inputSchemas';

const action = CALENDAR_POLICY_ACTIONS.configureStatusTypes;
const resource = { kind: 'organization' } as const;

export async function createStatusType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = statusTypeCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	await requireCalendarPolicy(ctx, action, resource);
	return ctx.calendarCatalogs.createStatusType(parsed.data);
}

export async function updateStatusType(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = statusTypeUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, issueMessage(parsed.error));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.calendarCatalogs.updateStatusType(id, patch);
	if (!row) throw error(404, 'That status type is no longer available.');
	return row;
}

export async function setStatusTypeOrder(ctx: CalendarCatalogPorts, input: Record<string, unknown>) {
	const parsed = statusTypeOrderInput.safeParse(input);
	if (!parsed.success) throw error(400, 'Choose every status type once');
	const { statusTypeIds, expectedStatusTypeIds } = parsed.data;
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.calendarCatalogs.setStatusTypeOrder(statusTypeIds, expectedStatusTypeIds);
	if (statusTypeIds.length === 0) return;
	await ctx.audit.log({
		action: 'status_type.reordered',
		resourceType: 'organization',
		resourceId: ctx.auth.orgId,
		details: { count: statusTypeIds.length }
	});
}

export async function deleteStatusType(ctx: CalendarCatalogDeletionPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	if (!(await ctx.calendarCatalogs.deleteStatusType(id))) return;
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Status Type Deleted',
		message: 'A status type was deleted.'
	});
}
