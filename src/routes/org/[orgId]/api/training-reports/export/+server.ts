import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	generateTrainingReportWorkbookExport,
	type TrainingReportWorkbookExport
} from '$lib/server/core/useCases/trainingReportsQuery';
import { workbookBufferResponse } from '$lib/export/workbook';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { checkPlanFeature, type PlanGateDenial } from '$lib/server/core/useCases/planPolicyGates';
import {
	PRIVATE_REPORT_HEADERS,
	parseTrainingReportInput,
	toTrainingReportInput,
	trainingReportInput,
	type TrainingReportRouteInput
} from '../reportInput';

type TrainingReportExportOutput = TrainingReportWorkbookExport | { _planDenied: true; denial: PlanGateDenial };

export const _getConfig: RouteConfig<TrainingReportRouteInput, TrainingReportExportOutput> = {
	permission: 'training',
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	input: trainingReportInput,
	parseInput: (event) => parseTrainingReportInput(event.url),
	fn: async (ctx, input) => {
		const policy = await readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore });
		const feature = checkPlanFeature(policy, 'advanced_reporting');
		if (!feature.allowed) {
			return { _planDenied: true, denial: feature.denial };
		}
		return generateTrainingReportWorkbookExport(ctx, toTrainingReportInput(input));
	},
	formatOutput: (result) => {
		if ('_planDenied' in result) {
			return new Response(JSON.stringify({ error: result.denial.message, denial: result.denial }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return workbookBufferResponse(result.buffer, result.filename, PRIVATE_REPORT_HEADERS);
	}
};

export const GET = handle(_getConfig);
