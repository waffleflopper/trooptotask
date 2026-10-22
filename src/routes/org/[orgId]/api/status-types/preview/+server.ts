import { previewStatusEffect } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestRosterSettingsContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => previewStatusEffect(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterSettingsContext>>;

export const POST = handle(_postConfig);
