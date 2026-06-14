import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { createPersonnelUseCases } from '$lib/server/core/useCases/personnel';

const useCases = createPersonnelUseCases();

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => useCases.create(ctx, input)
};

export const POST = handle(_postConfig);

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => useCases.update(ctx, input)
};

export const PUT = handle(_putConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await useCases.archive(ctx, id);
		if (result?.requiresApproval) {
			return { requiresApproval: true };
		}
		return { success: true };
	},
	formatOutput: (result) => {
		if (result.requiresApproval) {
			return json(result, { status: 202 });
		}
		return json(result);
	}
};

export const DELETE = handle(_deleteConfig);

export const _patchConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.restoreRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		return event.request.json();
	},
	fn: async (ctx, input) => {
		const { action, id } = input;

		if (action !== 'restore') fail(400, 'Invalid action');
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		return useCases.restore(ctx, id);
	},
	formatOutput: (result) => {
		if (result.message && !result.success) {
			return json(result, { status: 422 });
		}
		return json(result);
	}
};

export const PATCH = handle(_patchConfig);
