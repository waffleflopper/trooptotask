import { saveRosterSettings } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSettingsContext } from '$lib/server/adapters/requestContexts.server';

export const _putConfig = {
	context: createRequestRosterSettingsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => saveRosterSettings(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterSettingsContext>>;

export const PUT = handle(_putConfig);
