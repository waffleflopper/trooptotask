import {
	availabilityImportInputSchema,
	type AvailabilityImportInput,
	type AvailabilityImportResult
} from '$features/calendar/contracts';
import { importAvailabilityEntries } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestAvailabilityContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestAvailabilityContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	policyResource: { kind: 'unscoped' },
	input: availabilityImportInputSchema,
	fn: (ctx, input) => importAvailabilityEntries(ctx, input)
} satisfies RouteConfig<
	AvailabilityImportInput,
	AvailabilityImportResult,
	ReturnType<typeof createRequestAvailabilityContext>
>;

export const POST = handle(_postConfig);
