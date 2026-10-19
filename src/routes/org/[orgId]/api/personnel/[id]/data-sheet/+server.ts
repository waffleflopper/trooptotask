import type { PersonnelDataSheetSaveResult } from '$features/personnel/contracts';
import { savePersonnelDataSheet } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelDataSheetContext } from '$lib/server/adapters/requestContexts.server';
import { json, type RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

interface DataSheetRouteInput {
	personnelId: string;
	body: Record<string, unknown>;
}

export const _putConfig: RouteConfig<
	DataSheetRouteInput,
	PersonnelDataSheetSaveResult,
	ReturnType<typeof createRequestPersonnelDataSheetContext>
> = {
	context: createRequestPersonnelDataSheetContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: routePersonnelId(event),
		body: await readJsonBody(event)
	}),
	fn: (ctx, { personnelId, body }) => savePersonnelDataSheet(ctx, personnelId, body),
	formatOutput: (result) => json(result, { status: result.saved ? 200 : 400 })
};

export const PUT = handle(_putConfig);
