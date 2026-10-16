import { listPersonnelAvailabilityHistory, listStatusTypeLabels } from '$features/calendar/index.server';
import { exportPersonnelWorkbook, type PersonnelExportOutput } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelExportContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { workbookBufferResponse } from '$lib/utils/workbook';
import type { RequestEvent } from '@sveltejs/kit';

export const _getConfig: RouteConfig<
	{ personnelId: string; asOf: string },
	PersonnelExportOutput,
	ReturnType<typeof createRequestPersonnelExportContext>
> = {
	context: createRequestPersonnelExportContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ personnelId: event.params.id as string, asOf: viewerToday(event.cookies) }),
	fn: (ctx, input) =>
		exportPersonnelWorkbook(
			ctx,
			input,
			(personnelId) => listPersonnelAvailabilityHistory(ctx, personnelId),
			() => listStatusTypeLabels(ctx.calendarCatalogs),
			() => ctx.trainingCatalog.listTypeLabels(),
			(personnelId) =>
				ctx.trainingCompletions.listPersonExportFacts(personnelId).then((rows) =>
					rows.map((row) => ({
						training_type_id: row.trainingTypeId,
						completion_date: row.completionDate,
						expiration_date: row.expirationDate,
						notes: row.notes
					}))
				)
		),
	formatOutput: (result) => {
		return workbookBufferResponse(result._buffer, result._filename);
	}
};

export const GET = handle(_getConfig);
