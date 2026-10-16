import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routeArtifactIds } from '../../routeIds';
import { json } from '@sveltejs/kit';

import {
	archivePersonnelFollowUp,
	deletePersonnelFollowUp,
	restorePersonnelFollowUp,
	setPersonnelFollowUpStatus,
	updatePersonnelFollowUp
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

function routeIds(event: RequestEvent): { personnelId: string; followUpId: string } {
	return routeArtifactIds(event, 'followUpId', 'Follow-up not found');
}

export const _patchConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => {
		const ids = routeIds(event);
		const body = await readJsonBody(event);
		return { ...body, ...ids };
	},
	fn: (ctx, input) => {
		const hasEditFields = input.title !== undefined || input.notes !== undefined || input.dueDate !== undefined;
		if (input.status !== undefined && hasEditFields) {
			fail(400, 'Update status separately from follow-up details');
		}
		if (input.action !== undefined && input.action !== 'restore') fail(400, 'Unsupported follow-up action.');
		if (input.status !== undefined && !['open', 'completed', 'archived'].includes(String(input.status))) {
			fail(400, 'Unsupported follow-up status.');
		}
		if (input.action === 'restore') return restorePersonnelFollowUp(ctx, input);
		if (input.status === 'archived') return archivePersonnelFollowUp(ctx, input);
		if (input.status === 'open' || input.status === 'completed') return setPersonnelFollowUpStatus(ctx, input);
		return updatePersonnelFollowUp(ctx, input);
	}
};

export const _deleteConfig: RouteConfig<
	{ personnelId: string; followUpId: string },
	{ success: true },
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelFollowUp(ctx, input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
