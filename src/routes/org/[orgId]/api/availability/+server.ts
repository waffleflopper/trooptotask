import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy } from '$lib/server/core/useCases/calendarPolicy';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';

// Note: No PUT handler - availability entries are created/deleted, not updated
const handlers = entityHandlers(AvailabilityEntryEntity, {
	policyResourceForPersonnel: async (ctx, personnelId) => {
		if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
		const groups = await ctx.personnelCalendarRoster.findGroupIds(ctx.auth, [personnelId]);
		if (!groups.has(personnelId)) {
			// A Group-scoped caller receives the existing scope denial; an
			// Organization operator gets a missing-target error before the DB write.
			await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.manageAvailability, { kind: 'organization' });
			fail(404, 'Person not found');
		}
		const groupId = groups.get(personnelId);
		return groupId ? { kind: 'group', groupId } : { kind: 'organization' };
	}
});

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

export const _postConfig = handlers._configs.POST!;
export const _deleteConfig = handlers._configs.DELETE!;
