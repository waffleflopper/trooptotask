import { personnelArtifactsContext, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { fail } from '$lib/errors';

import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	archivePersonnelCounselingRecord,
	deletePersonnelCounselingRecord,
	restorePersonnelCounselingRecord
} from '$features/personnel/index.server';

function routeIds(event: RequestEvent): { personnelId: string; recordId: string } {
	const personnelId = event.params.id;
	const recordId = event.params.recordId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!recordId) fail(400, 'Missing counseling record id');
	return { personnelId, recordId };
}

export const _patchConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ ...(await event.request.json()), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelCounselingRecord(
				personnelArtifactsContext(ctx),
				input as { personnelId: string; recordId: string }
			);
		if (input.action === 'archive')
			return archivePersonnelCounselingRecord(
				personnelArtifactsContext(ctx),
				input as { personnelId: string; recordId: string }
			);
		fail(400, 'Unsupported counseling record action.');
	}
};

export const _deleteConfig: RouteConfig<{ personnelId: string; recordId: string }, { success: true }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelCounselingRecord(personnelArtifactsContext(ctx), input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
