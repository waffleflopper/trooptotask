import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	executeOrganizationDataExport,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$lib/server/core/useCases/organizationDataExportExecution';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { buildOrganizationDataExportWorkbook } from '$lib/server/core/useCases/organizationExportWorkbook';
import { workbookBufferResponse, writeWorkbookBuffer } from '$lib/export/workbook';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface ExcelExportInput {
	email: string | undefined;
}

type WorkbookExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'workbook' }>;
type ExcelExportOutput = OrganizationDataExportExecutionResult<WorkbookExportArtifact>;

export const _postConfig: RouteConfig<ExcelExportInput, ExcelExportOutput> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.organization.exportData,
	policyResource: { kind: 'organization' },
	parseInput: (event: RequestEvent) => ({
		email: event.locals.user?.email
	}),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		return executeOrganizationDataExport(ctx, {
			requestedByEmail: input.email,
			auditAction: 'export.excel_created',
			buildArtifact: async () => {
				const exportData = await loadOrganizationExportPayload(ctx.rawStore, orgId);
				const exportWorkbook = await buildOrganizationDataExportWorkbook({
					payload: exportData,
					selection: { mode: 'all' }
				});
				const buffer = await writeWorkbookBuffer(exportWorkbook.workbook);

				return {
					kind: 'workbook',
					buffer,
					filename: exportWorkbook.filename,
					fileSizeBytes: buffer.byteLength
				};
			}
		});
	},
	formatOutput: (result) => {
		if (result.status === 'rate_limited') {
			return new Response(JSON.stringify({ error: result.error, denial: result.denial }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return workbookBufferResponse(result.artifact.buffer, result.artifact.filename);
	}
};

export const POST = handle(_postConfig);
