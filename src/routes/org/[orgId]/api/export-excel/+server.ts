import {
	buildOrganizationDataExportWorkbook,
	executeOrganizationDataExport,
	loadOrganizationExportPayload,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$features/data-export/index.server';
import type { DeletionRequestStore } from '$features/deletion-requests/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createRequestDeletionRequestStore, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationExportContext } from '$lib/server/adapters/requestContexts.server';
import { workbookBufferResponse, writeWorkbookBuffer } from '$lib/utils/workbook';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { createOrganizationDataExportReads } from '../organizationDataExportDelivery.server';

interface ExcelExportInput {
	email: string | undefined;
}

type WorkbookExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'workbook' }>;
type ExcelExportOutput = OrganizationDataExportExecutionResult<WorkbookExportArtifact>;

export function _createPostConfig(
	store: DeletionRequestStore
): RouteConfig<ExcelExportInput, ExcelExportOutput, ReturnType<typeof createRequestOrganizationExportContext>> {
	return {
		context: createRequestOrganizationExportContext,
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
					const exportData = await loadOrganizationExportPayload(orgId, createOrganizationDataExportReads(ctx, store));
					const exportWorkbook = await buildOrganizationDataExportWorkbook({ payload: exportData });
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
			return workbookBufferResponse(result.artifact.buffer, result.artifact.filename);
		}
	};
}

export const POST: RequestHandler = (event) =>
	handle(_createPostConfig(createRequestDeletionRequestStore(event.locals)))(event);
