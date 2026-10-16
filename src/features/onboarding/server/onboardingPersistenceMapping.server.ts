import type {
	OnboardingTemplate,
	OnboardingStepProgress,
	PersonnelOnboarding,
	SavedOnboardingTemplateStep,
	OnboardingTemplateStepData,
	OnboardingTemplateData
} from '../contracts';

export const TEMPLATE_NAME_EXISTS_MESSAGE = 'An Onboarding template with that name already exists.';

export const TEMPLATE_FIELDS = 'id, organization_id, name, description, created_at';
export const STEP_FIELDS =
	'id, organization_id, template_id, name, description, step_type, training_type_id, stages, sort_order, created_at';
export const PROGRESS_FIELDS =
	'id, onboarding_id, step_name, step_type, training_type_id, stages, sort_order, completed, current_stage, notes, template_step_id, active, progress_changed_at';
export const PACKET_FIELDS = `id, personnel_id, started_at, completed_at, cancelled_at, status, template_id, onboarding_step_progress(${PROGRESS_FIELDS})`;

export interface TemplateRow {
	id: string;
	organization_id: string;
	name: string;
	description: string | null;
	created_at: string | null;
}
export interface StepRow {
	id: string;
	organization_id: string;
	template_id: string;
	name: string;
	description: string | null;
	step_type: OnboardingTemplateStepData['stepType'];
	training_type_id: string | null;
	stages: string[] | null;
	sort_order: number;
	created_at: string;
}
export interface ProgressRow {
	id: string;
	onboarding_id: string;
	step_name: string;
	step_type: OnboardingStepProgress['stepType'];
	training_type_id?: string | null;
	stages?: string[] | null;
	sort_order: number;
	completed: boolean;
	current_stage?: string | null;
	notes?: unknown;
	template_step_id?: string | null;
	active?: boolean | null;
	progress_changed_at: string;
}
export interface PacketRow {
	id: string;
	personnel_id: string;
	started_at: string;
	completed_at?: string | null;
	cancelled_at?: string | null;
	status: PersonnelOnboarding['status'];
	template_id?: string | null;
	onboarding_step_progress?: ProgressRow[] | null;
}
export function toTemplate(row: TemplateRow): OnboardingTemplate {
	return {
		id: row.id,
		orgId: row.organization_id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at
	};
}
export function toStep(row: StepRow): SavedOnboardingTemplateStep {
	return {
		id: row.id,
		organization_id: row.organization_id,
		templateId: row.template_id,
		name: row.name,
		description: row.description,
		stepType: row.step_type,
		trainingTypeId: row.training_type_id,
		stages: row.stages,
		sortOrder: row.sort_order,
		created_at: row.created_at
	};
}
export function toProgress(row: ProgressRow): OnboardingStepProgress {
	return {
		id: row.id,
		onboardingId: row.onboarding_id,
		stepName: row.step_name,
		stepType: row.step_type,
		trainingTypeId: row.training_type_id ?? null,
		stages: row.stages ?? null,
		sortOrder: row.sort_order,
		completed: row.completed,
		currentStage: row.current_stage ?? null,
		notes: Array.isArray(row.notes) ? row.notes : [],
		templateStepId: row.template_step_id ?? null,
		active: row.active ?? true,
		progressChangedAt: row.progress_changed_at
	};
}
export function toPacket(row: PacketRow): PersonnelOnboarding {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		startedAt: row.started_at,
		completedAt: row.completed_at ?? null,
		cancelledAt: row.cancelled_at ?? null,
		status: row.status,
		templateId: row.template_id ?? null,
		steps: [...(row.onboarding_step_progress ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(toProgress)
	};
}
export function templatePatch(data: Partial<OnboardingTemplateData>) {
	return {
		...(data.name !== undefined ? { name: data.name } : {}),
		...(data.description !== undefined ? { description: data.description } : {})
	};
}
export function stepPatch(data: Partial<OnboardingTemplateStepData>) {
	return {
		...(data.templateId !== undefined ? { template_id: data.templateId } : {}),
		...(data.name !== undefined ? { name: data.name } : {}),
		...(data.description !== undefined ? { description: data.description } : {}),
		...(data.stepType !== undefined ? { step_type: data.stepType } : {}),
		...(data.trainingTypeId !== undefined ? { training_type_id: data.trainingTypeId } : {}),
		...(data.stages !== undefined ? { stages: data.stages } : {}),
		...(data.sortOrder !== undefined ? { sort_order: data.sortOrder } : {})
	};
}
