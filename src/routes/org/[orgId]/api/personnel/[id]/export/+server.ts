import { listPersonnelAvailabilityHistory, listStatusTypeLabels } from '$features/calendar/index.server';
import { exportPersonnelWorkbook, type PersonnelExportOutput } from '$features/personnel/index.server';
import { listPersonnelTrainingExportRows, listTrainingTypeLabels } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelExportContext } from '$lib/server/adapters/requestContexts.server';
import { workbookBufferResponse } from '$lib/utils/workbook';
import type { RequestEvent } from '@sveltejs/kit';

export const _getConfig: RouteConfig<
	{ personnelId: string },
	PersonnelExportOutput,
	ReturnType<typeof createRequestPersonnelExportContext>
> = {
	context: createRequestPersonnelExportContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ personnelId: event.params.id as string }),
	fn: (ctx, input) =>
		exportPersonnelWorkbook(
			ctx,
			input,
			(personnelId) => listPersonnelAvailabilityHistory(ctx, personnelId),
			() => listStatusTypeLabels(ctx.rawStore, ctx.auth.orgId),
			() => listTrainingTypeLabels(ctx.rawStore, ctx.auth.orgId),
			(personnelId) => listPersonnelTrainingExportRows(ctx.rawStore, ctx.auth.orgId, personnelId)
		),
	formatOutput: (result) => {
		return workbookBufferResponse(result._buffer, result._filename);
	}
};

export const GET = handle(_getConfig);
