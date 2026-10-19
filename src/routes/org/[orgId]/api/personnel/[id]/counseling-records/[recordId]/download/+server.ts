import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routeArtifactIds } from '../../../routeIds';

import { createPersonnelCounselingDownloadUrl } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface PersonnelCounselingDownloadInput {
	personnelId: string;
	recordId: string;
}

export const _getConfig: RouteConfig<
	PersonnelCounselingDownloadInput,
	{ url: string },
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => routeArtifactIds(event, 'recordId', 'Counseling record not found'),
	fn: (ctx, input) => createPersonnelCounselingDownloadUrl(ctx, input)
};

export const GET = handle(_getConfig);
