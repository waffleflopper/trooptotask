import type { PolicyResource } from '$lib/access/policyEvaluator';
import {
	CALENDAR_POLICY_ACTIONS,
	requireCalendarPolicy,
	type CalendarAvailabilityPorts
} from '$lib/server/core/useCases/calendarPolicy';
import { availabilityCreateInput, availabilityUpdateInput } from './calendarPersistenceMapping.server';
export { availabilityUpdateInput } from './calendarPersistenceMapping.server';
import { error } from '@sveltejs/kit';

async function policyResourceForPersonnel(
	ctx: CalendarAvailabilityPorts,
	personnelId: string
): Promise<PolicyResource> {
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

async function policyResourceForRecord(ctx: CalendarAvailabilityPorts, id: string): Promise<PolicyResource> {
	const row = await ctx.calendarAvailability.findReference(id);
	if (!row && (ctx.auth.scopeSet.kind === 'organization' || ctx.auth.isPrivileged)) {
		throw error(404, 'Availability entry not found');
	}
	return row ? policyResourceForPersonnel(ctx, row.personnelId) : { kind: 'organization' };
}

export async function createAvailability(ctx: CalendarAvailabilityPorts, input: Record<string, unknown>) {
	const parsed = availabilityCreateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const resource = await policyResourceForPersonnel(ctx, parsed.data.personnelId);
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, resource);
	const row = await ctx.calendarAvailability.create(parsed.data);
	ctx.audit.log({
		action: 'availability.created',
		resourceType: 'availability',
		resourceId: row.id
	});
	return row;
}

export async function updateAvailability(ctx: CalendarAvailabilityPorts, input: Record<string, unknown>) {
	const parsed = availabilityUpdateInput.safeParse(input);
	if (!parsed.success) throw error(400, parsed.error.issues.map((issue) => issue.message).join('; '));
	const { id, ...patch } = parsed.data;
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, await policyResourceForRecord(ctx, id));
	const row = await ctx.calendarAvailability.update(id, patch);
	ctx.audit.log({ action: 'availability.updated', resourceType: 'availability', resourceId: id });
	return row;
}

export async function deleteAvailability(ctx: CalendarAvailabilityPorts, id: string): Promise<void> {
	await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, await policyResourceForRecord(ctx, id));
	await ctx.calendarAvailability.delete(id);
	ctx.audit.log({ action: 'availability.deleted', resourceType: 'availability', resourceId: id });
}
