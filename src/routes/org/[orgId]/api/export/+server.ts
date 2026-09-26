import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	executeOrganizationDataExport,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$lib/server/core/useCases/organizationDataExportExecution';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface ExportInput {
	email: string | undefined;
}

type JsonExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'json' }>;
type ExportOutput = OrganizationDataExportExecutionResult<JsonExportArtifact>;

export const _postConfig: RouteConfig<ExportInput, ExportOutput> = {
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
			auditAction: 'export.created',
			buildArtifact: async () => {
				if (!ctx.personnelOrganizationExport) throw new Error('Personnel Organization export port is required');
				const exportData = await loadOrganizationExportPayload(ctx.rawStore, ctx.auth, ctx.personnelOrganizationExport);
				const jsonStr = JSON.stringify(exportData, null, 2);
				const dateStr = exportData.exportedAt.split('T')[0] || new Date().toISOString().split('T')[0];

				return {
					kind: 'json',
					body: jsonStr,
					filename: `org-export-${orgId}-${dateStr}.json`,
					fileSizeBytes: new TextEncoder().encode(jsonStr).length
				};
			}
		});
	},
	formatOutput: (result) => {
		return new Response(result.artifact.body, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${result.artifact.filename}"`
			}
		});
	}
};

export const POST = handle(_postConfig);
