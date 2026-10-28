import { calendarSuggestionsInputSchema } from '$features/calendar/contracts';
import { applyCalendarSuggestions } from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle } from '$lib/server/adapters/httpAdapter';
import { createRequestCalendarCatalogContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestCalendarCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'organization' as const },
	input: calendarSuggestionsInputSchema,
	fn: applyCalendarSuggestions
};

export const POST = handle(_postConfig);
