import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	executeOrganizationDataExport,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$lib/server/core/useCases/organizationDataExportExecution';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';

interface ExportInput {
	email: string | undefined;
}

type JsonExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'json' }>;
type ExportOutput = OrganizationDataExportExecutionResult<JsonExportArtifact>;

export const _postConfig: RouteConfig<ExportInput, ExportOutput> = {
	permission: 'manageMembers',
	mutation: true,
	parseInput: (event: RequestEvent) => ({
		email: event.locals.user?.email
	}),
	fn: async (ctx, input) => {
		const orgId = ctx.auth.orgId;
		return executeOrganizationDataExport(ctx, {
			requestedByEmail: input.email,
			auditAction: 'export.created',
			buildArtifact: async () => {
				const exportData = await loadOrganizationExportPayload(ctx.rawStore, orgId);
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
		if (result.status === 'rate_limited') {
			return new Response(JSON.stringify({ error: result.error, denial: result.denial }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response(result.artifact.body, {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': `attachment; filename="${result.artifact.filename}"`
			}
		});
	}
};

export const POST = handle(_postConfig);
