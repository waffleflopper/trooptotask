import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { QueryPorts, UseCaseContext, WritePorts } from '$lib/server/core/ports';
import { requirePolicyDecision } from '$lib/server/core/useCases/policyAuthorization';
import type {
	DutyRosterTemplate,
	DutyRosterTemplateAcceptPreviewInput,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateArchiveInput,
	DutyRosterTemplateConfiguredCreateInput,
	DutyRosterTemplateCorrectionInput,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateCreateInput,
	DutyRosterTemplateGenerateInput,
	DutyRosterTemplateManualSelectionInput,
	DutyRosterTemplateRunCorrection,
	DutyRosterTemplateSetupOptions,
	DutyRosterTemplateSettingsData,
	DutyRosterTemplateSettingsInput
} from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import type {
	DutyRosterTemplateRunHistoryPage,
	ListAcceptedDutyRosterTemplateRunsOptions
} from './duty-roster/acceptedRuns';
import {
	acceptAndApplyDutyRosterTemplatePreviewLifecycle,
	acceptDutyRosterTemplatePreviewLifecycle,
	applyAcceptedDutyRosterTemplateRunLifecycle,
	applyDutyRosterTemplatePreviewManualSelectionLifecycle,
	archiveDutyRosterTemplateLifecycle,
	createConfiguredDutyRosterTemplateLifecycle,
	createDutyRosterTemplateLifecycle,
	findDutyRosterTemplateBySlugLifecycle,
	generateDutyRosterTemplatePreviewLifecycle,
	invalidateLatestDutyRosterTemplateRunLifecycle,
	listAcceptedDutyRosterTemplateRunHistoryLifecycle,
	listAcceptedDutyRosterTemplateRunsLifecycle,
	listDutyRosterTemplatesLifecycle,
	loadDutyRosterTemplateCountReadModelLifecycle,
	loadDutyRosterTemplateSettingsLifecycle,
	loadDutyRosterTemplateSetupOptionsLifecycle,
	recordDutyRosterTemplateRunCorrectionLifecycle,
	updateDutyRosterTemplateSettingsLifecycle
} from './duty-roster/templateLifecycle';

type DutyRosterTemplateQueryPorts = QueryPorts & Pick<UseCaseContext, 'audit'>;

async function requireTemplateView(ctx: DutyRosterTemplateQueryPorts): Promise<void> {
	await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit }, POLICY_ACTION_CATALOG.calendar.viewAvailability, {
		kind: 'unscoped'
	});
}

async function requireTemplateManagement(ctx: WritePorts): Promise<void> {
	await requirePolicyDecision(
		{ auth: ctx.auth, audit: ctx.audit, readOnlyGuard: ctx.readOnlyGuard },
		POLICY_ACTION_CATALOG.calendar.manageAssignments,
		{ kind: 'unscoped' }
	);
}

export async function listDutyRosterTemplates(ctx: DutyRosterTemplateQueryPorts): Promise<DutyRosterTemplate[]> {
	await requireTemplateView(ctx);
	return listDutyRosterTemplatesLifecycle(ctx);
}

export async function findDutyRosterTemplateBySlug(
	ctx: DutyRosterTemplateQueryPorts,
	slug: string
): Promise<DutyRosterTemplate | null> {
	await requireTemplateView(ctx);
	return findDutyRosterTemplateBySlugLifecycle(ctx, slug);
}

export async function createDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateCreateInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);
	return createDutyRosterTemplateLifecycle(ctx, input);
}

export async function createConfiguredDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateConfiguredCreateInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);
	return createConfiguredDutyRosterTemplateLifecycle(ctx, input);
}

export async function loadDutyRosterTemplateSettings(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateSettingsData> {
	await requireTemplateView(ctx);
	return loadDutyRosterTemplateSettingsLifecycle(ctx, template);
}

export async function loadDutyRosterTemplateSetupOptions(
	ctx: DutyRosterTemplateQueryPorts
): Promise<DutyRosterTemplateSetupOptions> {
	await requireTemplateView(ctx);
	return loadDutyRosterTemplateSetupOptionsLifecycle(ctx);
}

export async function loadDutyRosterTemplateCountReadModel(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateCountReadModel> {
	await requireTemplateView(ctx);
	return loadDutyRosterTemplateCountReadModelLifecycle(ctx, template);
}

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string,
	options?: ListAcceptedDutyRosterTemplateRunsOptions
): Promise<DutyRosterTemplateAcceptedRun[]> {
	await requireTemplateView(ctx);
	return listAcceptedDutyRosterTemplateRunsLifecycle(ctx, templateId, options);
}

export async function listAcceptedDutyRosterTemplateRunHistory(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string,
	options?: ListAcceptedDutyRosterTemplateRunsOptions
): Promise<DutyRosterTemplateRunHistoryPage> {
	await requireTemplateView(ctx);
	return listAcceptedDutyRosterTemplateRunHistoryLifecycle(ctx, templateId, options);
}

export async function updateDutyRosterTemplateSettings(
	ctx: WritePorts,
	input: DutyRosterTemplateSettingsInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);
	return updateDutyRosterTemplateSettingsLifecycle(ctx, input);
}

export async function archiveDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateArchiveInput
): Promise<DutyRosterTemplate> {
	await requireTemplateManagement(ctx);
	return archiveDutyRosterTemplateLifecycle(ctx, input);
}

export async function generateDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateGenerateInput
): Promise<DutyRosterTemplatePreview> {
	await requireTemplateManagement(ctx);
	return generateDutyRosterTemplatePreviewLifecycle(ctx, input);
}

export async function acceptDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateAcceptedRun> {
	await requireTemplateManagement(ctx);
	return acceptDutyRosterTemplatePreviewLifecycle(ctx, input);
}

export async function applyAcceptedDutyRosterTemplateRun(ctx: WritePorts, input: { runId: string }) {
	await requireTemplateManagement(ctx);
	return applyAcceptedDutyRosterTemplateRunLifecycle(ctx, input);
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	await requireTemplateManagement(ctx);
	return recordDutyRosterTemplateRunCorrectionLifecycle(ctx, input);
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; cascade?: boolean }
) {
	await requireTemplateManagement(ctx);
	return invalidateLatestDutyRosterTemplateRunLifecycle(ctx, input);
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
) {
	await requireTemplateManagement(ctx);
	return acceptAndApplyDutyRosterTemplatePreviewLifecycle(ctx, input);
}

export async function applyDutyRosterTemplatePreviewManualSelection(
	ctx: WritePorts,
	input: DutyRosterTemplateManualSelectionInput
): Promise<DutyRosterTemplatePreview> {
	await requireTemplateManagement(ctx);
	return applyDutyRosterTemplatePreviewManualSelectionLifecycle(ctx, input);
}
