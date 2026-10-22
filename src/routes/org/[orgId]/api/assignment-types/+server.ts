import {
	createAssignmentType,
	deleteAssignmentType,
	listAssignmentTypes,
	updateAssignmentType
} from '$features/calendar/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	createRequestCalendarCatalogDeletionContext,
	createRequestCalendarCatalogContext,
	createRequestRosterSettingsContext
} from '$lib/server/adapters/requestContexts.server';
import { validateUUID } from '$lib/server/validation';

export const _getConfig = {
	context: createRequestCalendarCatalogContext,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx) => listAssignmentTypes(ctx.calendarCatalogs)
} satisfies RouteConfig<void, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const _postConfig = {
	context: createRequestCalendarCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createAssignmentType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestCalendarCatalogContext>>;

export const _putConfig = {
	context: createRequestRosterSettingsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateAssignmentType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown, ReturnType<typeof createRequestRosterSettingsContext>>;

export const _deleteConfig = {
	context: createRequestCalendarCatalogDeletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteAssignmentType(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestCalendarCatalogDeletionContext>
>;

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
