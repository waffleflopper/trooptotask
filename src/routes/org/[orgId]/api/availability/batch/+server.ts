import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createAvailabilityBatch, deleteAvailabilityBatch } from '$lib/server/core/useCases/availabilityBatch';

// Use case functions validate input internally; handle() parses raw JSON body
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyInput = any;

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createAvailabilityBatch(ctx, input)
} satisfies RouteConfig<AnyInput, unknown>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => deleteAvailabilityBatch(ctx, input)
} satisfies RouteConfig<AnyInput, unknown>;

export const POST = handle(_postConfig);
export const DELETE = handle(_deleteConfig);
