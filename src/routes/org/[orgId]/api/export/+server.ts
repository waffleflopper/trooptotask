import type { DeletionRequestStore } from '$features/deletion-requests/index.server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { handle, createRequestDeletionRequestStore, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	executeOrganizationDataExport,
	loadOrganizationExportPayload,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$features/data-export/index.server';
import { createOrganizationDataExportReads } from '../organizationDataExportDelivery.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

interface ExportInput {
	email: string | undefined;
}

type JsonExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'json' }>;
type ExportOutput = OrganizationDataExportExecutionResult<JsonExportArtifact>;

export function _createPostConfig(store: DeletionRequestStore): RouteConfig<ExportInput, ExportOutput> {
	return {
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
					const exportData = await loadOrganizationExportPayload(orgId, createOrganizationDataExportReads(ctx, store));
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
}

export const POST: RequestHandler = (event) =>
	handle(_createPostConfig(createRequestDeletionRequestStore(event.locals)))(event);
