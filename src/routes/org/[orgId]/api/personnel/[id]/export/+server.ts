import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { workbookBufferResponse } from '$lib/export/workbook';
import { exportPersonnelWorkbook, type PersonnelExportOutput } from '$lib/server/core/useCases/personnelExport';
import { listPersonnelAvailabilityHistory, listStatusTypeLabels } from '$features/calendar/index.server';

export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelExportOutput> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.exportRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({ personnelId: event.params.id as string }),
	fn: (ctx, input) => exportPersonnelWorkbook(ctx, input, listPersonnelAvailabilityHistory, listStatusTypeLabels),
	formatOutput: (result) => {
		return workbookBufferResponse(result._buffer, result._filename);
	}
};

export const GET = handle(_getConfig);
