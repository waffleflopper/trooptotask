import { createAvailabilityBatch, deleteAvailabilityBatch } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createRequestAvailabilityContext,
	createRequestAvailabilityRemovalContext
} from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestAvailabilityContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createAvailabilityBatch(ctx, input)
} satisfies RouteConfig<
	Parameters<typeof createAvailabilityBatch>[1],
	unknown,
	ReturnType<typeof createRequestAvailabilityContext>
>;

export const _deleteConfig = {
	context: createRequestAvailabilityRemovalContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => deleteAvailabilityBatch(ctx, input)
} satisfies RouteConfig<
	Parameters<typeof deleteAvailabilityBatch>[1],
	unknown,
	ReturnType<typeof createRequestAvailabilityRemovalContext>
>;

export const POST = handle(_postConfig);
export const DELETE = handle(_deleteConfig);
