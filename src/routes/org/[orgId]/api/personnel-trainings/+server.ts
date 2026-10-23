import { createRequestTrainingRosterContext } from '$lib/server/adapters/featureRequestContexts.server';
import { json } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	listPersonTrainingRecords,
	updateTrainingRecord
} from '$features/training/index.server';
import type { PersonnelTraining } from '$features/training/contracts';

export const _getConfig: RouteConfig<
	{ personnelId: string },
	PersonnelTraining[],
	ReturnType<typeof createRequestTrainingRosterContext>
> = {
	context: createRequestTrainingRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => {
		const personnelId = event.url.searchParams.get('personnelId');
		if (!personnelId || !validateUUID(personnelId)) fail(400, 'Invalid personnel id');
		return { personnelId };
	},
	fn: (ctx, input) => listPersonTrainingRecords(ctx, input.personnelId),
	formatOutput: privateJson
};

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestTrainingRosterContext>
> = {
	context: createRequestTrainingRosterContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createTrainingRecord(ctx, input)
};

export const _putConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestTrainingRosterContext>
> = {
	context: createRequestTrainingRosterContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateTrainingRecord(ctx, input)
};

export const _deleteConfig: RouteConfig<
	Record<string, unknown>,
	Record<string, unknown>,
	ReturnType<typeof createRequestTrainingRosterContext>
> = {
	context: createRequestTrainingRosterContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await deleteTrainingRecord(ctx, id);
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

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
