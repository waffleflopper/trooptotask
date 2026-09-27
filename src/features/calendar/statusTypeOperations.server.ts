import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarWritePorts,
	type CalendarWriteWithNotificationsPorts
} from '$lib/server/core/useCases/calendarPolicy';
import { StatusTypeEntity } from './statusTypeEntity.server';

const entity = StatusTypeEntity;
const action = CALENDAR_POLICY_ACTIONS.configureStatusTypes;
const resource = { kind: 'organization' } as const;

export async function createStatusType(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = entity.createSchema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.store.insert<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		entity.toDbInsert(parsed.data, ctx.auth.orgId),
		entity.select
	);
	ctx.audit.log({
		action: 'status_type.created',
		resourceType: 'status_type',
		resourceId: row.id as string | undefined
	});
	return entity.fromDb(row);
}

export async function updateStatusType(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = entity.updateSchema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const id = parsed.data.id as string;
	await requireCalendarPolicy(ctx, action, resource);
	const row = await ctx.store.update<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		id,
		entity.toDbUpdate(parsed.data),
		entity.select
	);
	ctx.audit.log({ action: 'status_type.updated', resourceType: 'status_type', resourceId: id });
	return entity.fromDb(row);
}

export async function deleteStatusType(ctx: CalendarWriteWithNotificationsPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.store.delete(entity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'status_type.deleted', resourceType: 'status_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Status Type Deleted',
		message: 'A status type was deleted.'
	});
}
