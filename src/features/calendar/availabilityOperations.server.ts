import type { PolicyResource } from '$lib/access/policyEvaluator';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarWritePorts
} from '$lib/server/core/useCases/calendarPolicy';
import { AvailabilityEntryEntity } from './availabilityEntity.server';
import { error } from '@sveltejs/kit';

async function policyResourceForPersonnel(ctx: CalendarWritePorts, personnelId: string): Promise<PolicyResource> {
	if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
	const groups = await ctx.personnelCalendarRoster.findGroupIds(ctx.auth, [personnelId]);
	if (!groups.has(personnelId)) {
		// An Organization operator can distinguish a missing Person; a Group member
		// receives the normal out-of-scope policy denial without disclosure.
		if (ctx.auth.scopeSet.kind === 'organization' || ctx.auth.isPrivileged) throw error(404, 'Person not found');
		return { kind: 'organization' };
	}
	const groupId = groups.get(personnelId);
	return groupId ? { kind: 'group', groupId } : { kind: 'organization' };
}

async function policyResourceForRecord(ctx: CalendarWritePorts, id: string): Promise<PolicyResource> {
	const row = await (ctx.rawStore ?? ctx.store).findOne<Record<string, unknown>>(
		AvailabilityEntryEntity.table,
		ctx.auth.orgId,
		{ id }
	);
	if (!row && (ctx.auth.scopeSet.kind === 'organization' || ctx.auth.isPrivileged)) {
		throw error(404, 'Availability entry not found');
	}
	return typeof row?.personnel_id === 'string'
		? policyResourceForPersonnel(ctx, row.personnel_id)
		: { kind: 'organization' };
}

export const availabilityUpdateInput = AvailabilityEntryEntity.updateSchema.omit({ personnelId: true }).strict();

export async function createAvailability(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = AvailabilityEntryEntity.createSchema.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const resource = await policyResourceForPersonnel(ctx, parsed.data.personnelId as string);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, resource);
	const row = await ctx.store.insert<Record<string, unknown>>(
		AvailabilityEntryEntity.table,
		ctx.auth.orgId,
		AvailabilityEntryEntity.toDbInsert(parsed.data, ctx.auth.orgId),
		AvailabilityEntryEntity.select
	);
	ctx.audit.log({
		action: 'availability.created',
		resourceType: 'availability',
		resourceId: row.id as string | undefined
	});
	return AvailabilityEntryEntity.fromDb(row);
}

export async function updateAvailability(ctx: CalendarWritePorts, input: Record<string, unknown>) {
	const parsed = availabilityUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const id = parsed.data.id as string;
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, await policyResourceForRecord(ctx, id));
	const row = await ctx.store.update<Record<string, unknown>>(
		AvailabilityEntryEntity.table,
		ctx.auth.orgId,
		id,
		AvailabilityEntryEntity.toDbUpdate(parsed.data),
		AvailabilityEntryEntity.select
	);
	ctx.audit.log({ action: 'availability.updated', resourceType: 'availability', resourceId: id });
	return AvailabilityEntryEntity.fromDb(row);
}

export async function deleteAvailability(ctx: CalendarWritePorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, await policyResourceForRecord(ctx, id));
	await ctx.store.delete(AvailabilityEntryEntity.table, ctx.auth.orgId, id);
	ctx.audit.log({ action: 'availability.deleted', resourceType: 'availability', resourceId: id });
}
