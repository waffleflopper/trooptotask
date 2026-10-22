import { createRequestCriticalTasksReadContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { CriticalTasksWorkbookExport } from '$features/critical-tasks/contracts';
import { handle, PRIVATE_RESPONSE_HEADERS, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { generateCriticalTasksMatrixWorkbookExport } from '$features/critical-tasks/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { workbookBufferResponse } from '$lib/utils/workbook';
import {
	criticalTasksMatrixExportInput,
	parseCriticalTasksMatrixExportInput,
	toCriticalTasksMatrixExportInput,
	type CriticalTasksMatrixExportRouteInput
} from '../../reportInput';

export const _getConfig: RouteConfig<
	CriticalTasksMatrixExportRouteInput,
	CriticalTasksWorkbookExport,
	ReturnType<typeof createRequestCriticalTasksReadContext>
> = {
	context: createRequestCriticalTasksReadContext,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
	policyResource: { kind: 'unscoped' },
	input: criticalTasksMatrixExportInput,
	parseInput: parseCriticalTasksMatrixExportInput,
	fn: async (ctx, input) => generateCriticalTasksMatrixWorkbookExport(ctx, toCriticalTasksMatrixExportInput(input)),
	formatOutput: (result) => workbookBufferResponse(result.buffer, result.filename, PRIVATE_RESPONSE_HEADERS)
};

export const GET = handle(_getConfig);
