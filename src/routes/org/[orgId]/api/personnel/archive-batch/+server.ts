import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import type { ArchivePersonnelBatchResult } from '$features/personnel/contracts';
import { archivePersonnelBatch } from '$lib/server/personnelArchiveBatchDelivery';
import { validateUUID } from '$lib/server/validation';

interface ArchivePersonnelBatchRouteInput {
	ids: string[];
	userEmail: string;
}

export const _postConfig: RouteConfig<ArchivePersonnelBatchRouteInput, ArchivePersonnelBatchResult> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = (await event.request.json()) as Record<string, unknown>;
		const ids = body.ids;
		if (!Array.isArray(ids)) fail(400, 'Missing ids');
		if (!ids.every((id): id is string => typeof id === 'string' && validateUUID(id))) {
			fail(400, 'Invalid resource ID');
		}

		return {
			ids,
			userEmail: event.locals.user?.email ?? 'unknown'
		};
	},
	fn: (ctx, input) => archivePersonnelBatch(ctx, input),
	formatOutput: (result) => json(result)
};

export const POST = handle(_postConfig);
