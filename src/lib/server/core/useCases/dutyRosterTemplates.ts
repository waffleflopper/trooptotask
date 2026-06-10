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
} from './duty-roster/acceptedRunLifecycle';
import * as acceptedRunLifecycle from './duty-roster/acceptedRunLifecycle';
import * as templateAdministration from './duty-roster/templateAdministration';

type DutyRosterTemplateQueryPorts = QueryPorts & Pick<UseCaseContext, 'audit'>;

async function requireTemplateView(ctx: DutyRosterTemplateQueryPorts): Promise<void> {
	await requirePolicyDecision({ auth: ctx.auth, audit: ctx.audit }, POLICY_ACTION_CATALOG.calendar.viewDutyRosters, {
		kind: 'unscoped'
	});
}

async function requireTemplateConfiguration(ctx: WritePorts): Promise<void> {
	await requirePolicyDecision(
		{ auth: ctx.auth, audit: ctx.audit, readOnlyGuard: ctx.readOnlyGuard },
		POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
		{ kind: 'unscoped' }
	);
}

async function requireDutyRosterManagement(ctx: WritePorts): Promise<void> {
	await requirePolicyDecision(
		{ auth: ctx.auth, audit: ctx.audit, readOnlyGuard: ctx.readOnlyGuard },
		POLICY_ACTION_CATALOG.calendar.manageDutyRosters,
		{ kind: 'unscoped' }
	);
}

export async function listDutyRosterTemplates(ctx: DutyRosterTemplateQueryPorts): Promise<DutyRosterTemplate[]> {
	await requireTemplateView(ctx);
	return templateAdministration.listDutyRosterTemplates(ctx);
}

export async function findDutyRosterTemplateBySlug(
	ctx: DutyRosterTemplateQueryPorts,
	slug: string
): Promise<DutyRosterTemplate | null> {
	await requireTemplateView(ctx);
	return templateAdministration.findDutyRosterTemplateBySlug(ctx, slug);
}

export async function createDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateCreateInput
): Promise<DutyRosterTemplate> {
	await requireTemplateConfiguration(ctx);
	return templateAdministration.createDutyRosterTemplate(ctx, input);
}

export async function createConfiguredDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateConfiguredCreateInput
): Promise<DutyRosterTemplate> {
	await requireTemplateConfiguration(ctx);
	return templateAdministration.createConfiguredDutyRosterTemplate(ctx, input);
}

export async function loadDutyRosterTemplateSettings(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateSettingsData> {
	await requireTemplateView(ctx);
	return templateAdministration.loadDutyRosterTemplateSettings(ctx, template);
}

export async function loadDutyRosterTemplateSetupOptions(
	ctx: DutyRosterTemplateQueryPorts
): Promise<DutyRosterTemplateSetupOptions> {
	await requireTemplateView(ctx);
	return templateAdministration.loadDutyRosterTemplateSetupOptions(ctx);
}

export async function loadDutyRosterTemplateCountReadModel(
	ctx: DutyRosterTemplateQueryPorts,
	template: DutyRosterTemplate
): Promise<DutyRosterTemplateCountReadModel> {
	await requireTemplateView(ctx);
	return acceptedRunLifecycle.loadDutyRosterTemplateCountReadModel(ctx, template);
}

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string,
	options?: ListAcceptedDutyRosterTemplateRunsOptions
): Promise<DutyRosterTemplateAcceptedRun[]> {
	await requireTemplateView(ctx);
	return acceptedRunLifecycle.listAcceptedDutyRosterTemplateRuns(ctx, templateId, options);
}

export async function listAcceptedDutyRosterTemplateRunHistory(
	ctx: DutyRosterTemplateQueryPorts,
	templateId: string,
	options?: ListAcceptedDutyRosterTemplateRunsOptions
): Promise<DutyRosterTemplateRunHistoryPage> {
	await requireTemplateView(ctx);
	return acceptedRunLifecycle.listAcceptedDutyRosterTemplateRunHistory(ctx, templateId, options);
}

export async function updateDutyRosterTemplateSettings(
	ctx: WritePorts,
	input: DutyRosterTemplateSettingsInput
): Promise<DutyRosterTemplate> {
	await requireTemplateConfiguration(ctx);
	return templateAdministration.updateDutyRosterTemplateSettings(ctx, input);
}

export async function archiveDutyRosterTemplate(
	ctx: WritePorts,
	input: DutyRosterTemplateArchiveInput
): Promise<DutyRosterTemplate> {
	await requireTemplateConfiguration(ctx);
	return templateAdministration.archiveDutyRosterTemplate(ctx, input);
}

export async function generateDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateGenerateInput
): Promise<DutyRosterTemplatePreview> {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.generateDutyRosterTemplatePreview(ctx, input);
}

export async function acceptDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
): Promise<DutyRosterTemplateAcceptedRun> {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.acceptDutyRosterTemplatePreview(ctx, input);
}

export async function applyAcceptedDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; calendarSyncPlanToken?: string | null }
) {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.applyAcceptedDutyRosterTemplateRun(ctx, input);
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.recordDutyRosterTemplateRunCorrection(ctx, input);
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string; cascade?: boolean }
) {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.invalidateLatestDutyRosterTemplateRun(ctx, input);
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: DutyRosterTemplateAcceptPreviewInput
) {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.acceptAndApplyDutyRosterTemplatePreview(ctx, input);
}

export async function applyDutyRosterTemplatePreviewManualSelection(
	ctx: WritePorts,
	input: DutyRosterTemplateManualSelectionInput
): Promise<DutyRosterTemplatePreview> {
	await requireDutyRosterManagement(ctx);
	return acceptedRunLifecycle.applyDutyRosterTemplatePreviewManualSelection(ctx, input);
}
