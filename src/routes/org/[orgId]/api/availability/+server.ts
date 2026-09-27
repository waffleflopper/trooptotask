import { entityHandlers, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { AvailabilityEntryEntity } from '$lib/server/entities/availabilityEntry';
import { POLICY_ACTION_CATALOG, type PolicyResource } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';

const policyResourceForPersonnel = async (ctx: UseCaseContext, personnelId: string): Promise<PolicyResource> => {
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
};

const handlers = entityHandlers(AvailabilityEntryEntity, { policyResourceForPersonnel });
const updateUseCases = createCrudUseCases({
	entity: AvailabilityEntryEntity,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	auditResource: 'availability',
	policyResourceForPersonnel
});

// Editing updates one saved row. The strict input prevents changing its Person or Organization.
export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	input: AvailabilityEntryEntity.updateSchema.omit({ personnelId: true }).strict(),
	fn: (ctx, input) => updateUseCases.update(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handlers.POST;
export const PUT = handle(_putConfig);
export const DELETE = handlers.DELETE;

export const _postConfig = handlers._configs.POST!;
export const _deleteConfig = handlers._configs.DELETE!;
