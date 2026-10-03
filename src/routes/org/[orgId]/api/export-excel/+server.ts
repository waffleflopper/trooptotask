import { listDeletionRequestExportRows, type DeletionRequestStore } from '$features/deletion-requests/index.server';
import {
	listOnboardingTemplateExportRows,
	listOnboardingTemplateStepExportRows,
	listPersonnelOnboardingExportRows,
	listOnboardingStepProgressExportRows
} from '$features/onboarding/index.server';
import { listRatingSchemeExportRows } from '$features/rating-scheme/index.server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { handle, createRequestDeletionRequestStore, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	executeOrganizationDataExport,
	type OrganizationDataExportArtifact,
	type OrganizationDataExportExecutionResult
} from '$lib/server/core/useCases/organizationDataExportExecution';
import { loadOrganizationExportPayload } from '$lib/server/core/useCases/organizationExport';
import { listNotificationExportRows } from '$features/notifications/index.server';
import { buildOrganizationDataExportWorkbook } from '$lib/server/core/useCases/organizationExportWorkbook';
import { workbookBufferResponse, writeWorkbookBuffer } from '$lib/utils/workbook';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	listTrainingTypeExportRows,
	listTrainingCompletionExportRows,
	listTrainingViewExportRows
} from '$features/training/index.server';

interface ExcelExportInput {
	email: string | undefined;
}

type WorkbookExportArtifact = Extract<OrganizationDataExportArtifact, { kind: 'workbook' }>;
type ExcelExportOutput = OrganizationDataExportExecutionResult<WorkbookExportArtifact>;

export function _createPostConfig(store: DeletionRequestStore): RouteConfig<ExcelExportInput, ExcelExportOutput> {
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
				auditAction: 'export.excel_created',
				buildArtifact: async () => {
					if (!ctx.personnelOrganizationExport) throw new Error('Personnel Organization export port is required');
					const exportData = await loadOrganizationExportPayload(
						ctx.rawStore,
						ctx.auth,
						ctx.personnelOrganizationExport,
						{
							listTrainingTypeExportRows,
							listTrainingCompletionExportRows,
							listTrainingViewExportRows
						},
						{
							listOnboardingTemplateExportRows,
							listOnboardingTemplateStepExportRows,
							listPersonnelOnboardingExportRows,
							listOnboardingStepProgressExportRows
						},
						{
							listNotificationExportRows: () => listNotificationExportRows(ctx.notificationSelf),
							listFeedbackExportRows: () => ctx.feedbackExport.listRows(orgId)
						},
						{ listRatingSchemeExportRows },
						ctx.organizationRawExport,
						{ listDeletionRequestExportRows: () => listDeletionRequestExportRows(store, orgId) }
					);
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
