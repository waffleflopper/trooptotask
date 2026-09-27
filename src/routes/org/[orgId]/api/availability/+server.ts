import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';

// Note: No PUT handler - availability entries are created/deleted, not updated
const handlers = entityHandlers(AvailabilityEntryEntity, {
	policyResourceForPersonnel: async (ctx, personnelId) => {
		if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
		const groups = await ctx.personnelCalendarRoster.findGroupIds(ctx.auth, [personnelId]);
		if (!groups.has(personnelId)) {
			// Let the normal Organization-resource policy conceal an out-of-scope
			// target from Group members. Organization authority can identify a
			// missing target before the database write.
			if (ctx.auth.scopeSet.kind === 'organization' || ctx.auth.isPrivileged) fail(404, 'Person not found');
			return { kind: 'organization' };
		}
		const groupId = groups.get(personnelId);
		return groupId ? { kind: 'group', groupId } : { kind: 'organization' };
	}
});

export const POST = handlers.POST;
export const DELETE = handlers.DELETE;

export const _postConfig = handlers._configs.POST!;
export const _deleteConfig = handlers._configs.DELETE!;
