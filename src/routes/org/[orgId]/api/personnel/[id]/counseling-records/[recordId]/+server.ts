import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routeArtifactIds } from '../../routeIds';
import { json } from '@sveltejs/kit';

import {
	archivePersonnelCounselingRecord,
	deletePersonnelCounselingRecord,
	restorePersonnelCounselingRecord
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { FileCleanup } from '$features/organization/contracts';

function routeIds(event: RequestEvent): { personnelId: string; recordId: string } {
	return routeArtifactIds(event, 'recordId', 'Counseling record not found');
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
	parseInput: async (event) => ({ ...(await readJsonBody(event)), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelCounselingRecord(ctx, input as { personnelId: string; recordId: string });
		if (input.action === 'archive')
			return archivePersonnelCounselingRecord(ctx, input as { personnelId: string; recordId: string });
		fail(400, 'Unsupported counseling record action.');
	}
};

export const _deleteConfig: RouteConfig<
	{ personnelId: string; recordId: string },
	{ success: true; fileCleanup: FileCleanup },
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => ({ success: true, ...(await deletePersonnelCounselingRecord(ctx, input)) }),
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
