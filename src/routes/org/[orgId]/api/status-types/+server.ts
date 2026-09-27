import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { createStatusType, updateStatusType, deleteStatusType } from '$features/calendar/index.server';

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createStatusType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateStatusType(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteStatusType(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
