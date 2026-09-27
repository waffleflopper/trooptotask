import { error } from '@sveltejs/kit';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarWritePorts,
	type CalendarWriteWithNotificationsPorts
} from '$lib/server/core/useCases/calendarPolicy';
import { AssignmentTypeEntity } from './assignmentTypeEntity.server';

const entity = AssignmentTypeEntity;
const action = CALENDAR_POLICY_ACTIONS.configureAssignmentTypes;
const resource = { kind: 'organization' } as const;

export async function createAssignmentType(ctx: CalendarWritePorts, input: Record<string, unknown>) {
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
		action: 'assignment_type.created',
		resourceType: 'assignment_type',
		resourceId: row.id as string | undefined
	});
	return entity.fromDb(row);
}

export async function updateAssignmentType(ctx: CalendarWritePorts, input: Record<string, unknown>) {
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
	ctx.audit.log({ action: 'assignment_type.updated', resourceType: 'assignment_type', resourceId: id });
	return entity.fromDb(row);
}

export async function deleteAssignmentType(ctx: CalendarWriteWithNotificationsPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, action, resource);
	await ctx.store.delete(entity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'assignment_type.deleted', resourceType: 'assignment_type', resourceId: id });
	await ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
		type: 'config_type_deleted',
		title: 'Assignment Type Deleted',
		message: 'An assignment type was deleted.'
	});
}
