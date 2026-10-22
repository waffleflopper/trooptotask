import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	OnboardingStepType,
	OnboardingStatus,
	PersonnelOnboarding,
	OnboardingBootstrapMode
} from './onboarding.types';

export type SavedOnboardingTemplate = OnboardingTemplate;

export type SavedOnboardingTemplateStep = OnboardingTemplateStep & {
	organization_id: string;
	created_at: string;
};

export interface OnboardingTemplateData {
	name: string;
	description: string | null;
}

export interface OnboardingTemplateStepData {
	templateId: string;
	name: string;
	description: string | null;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
}

export type PreparedOnboardingTemplateStep = OnboardingTemplateStepData & {
	id?: string;
};

export interface DuplicatedOnboardingTemplate {
	template: SavedOnboardingTemplate;
	steps: SavedOnboardingTemplateStep[];
	/** False when this request already made the copy and this call only returned it. */
	created: boolean;
}

export interface OnboardingCatalogPersistence {
	listTemplates(): Promise<SavedOnboardingTemplate[]>;
	listSteps(templateId?: string): Promise<SavedOnboardingTemplateStep[]>;
	findTemplate(id: string): Promise<SavedOnboardingTemplate | null>;
	findTemplateByName(name: string): Promise<SavedOnboardingTemplate | null>;
	findStep(id: string): Promise<SavedOnboardingTemplateStep | null>;
	findStepByTemplateAndName(templateId: string, name: string): Promise<SavedOnboardingTemplateStep | null>;
	hasAnyTemplate(): Promise<boolean>;
	createTemplate(data: OnboardingTemplateData): Promise<SavedOnboardingTemplate>;
	updateTemplate(id: string, data: Partial<OnboardingTemplateData>): Promise<SavedOnboardingTemplate>;
	/** Copies the template and its steps once per request id; a retry returns the same copy. */
	duplicateTemplate(sourceTemplateId: string, requestId: string): Promise<DuplicatedOnboardingTemplate>;
	/** Returns false when there was no such template. Steps go with it; packets keep their saved steps. */
	deleteTemplate(id: string): Promise<boolean>;
	createStep(data: PreparedOnboardingTemplateStep): Promise<SavedOnboardingTemplateStep>;
	updateStep(
		id: string,
		data: Partial<Omit<OnboardingTemplateStepData, 'sortOrder'>>
	): Promise<SavedOnboardingTemplateStep>;
	/** Saves positions in the given order; the ids must be exactly the template's current steps. */
	reorderSteps(templateId: string, orderedStepIds: readonly string[]): Promise<SavedOnboardingTemplateStep[]>;
	deleteStep(id: string): Promise<void>;
}

export interface OnboardingPacketReference {
	id: string;
	personnelId: string;
	status: OnboardingStatus;
	templateId: string | null;
}

export interface OnboardingProgressReference {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: OnboardingStepType;
	stages: string[] | null;
	completed: boolean;
	currentStage: string | null;
	active: boolean;
}

export interface SavedOnboardingProgress {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: OnboardingStepType;
	completed: boolean;
	currentStage: string | null;
	progressChangedAt: string;
}

export interface OnboardingCompletion {
	startedAt: string;
	completedAt: string;
}

export interface OnboardingWorkflowPersistence {
	listPackets(mode: OnboardingBootstrapMode): Promise<PersonnelOnboarding[]>;
	/** Start and finish dates of packets completed on or after `since` (YYYY-MM-DD). */
	listCompletionsSince(since: string): Promise<OnboardingCompletion[]>;
	listSavedActivePackets(): Promise<PersonnelOnboarding[]>;
	/** The distinct people with an in-progress packet among the packets the requester may see, without steps or notes. */
	listActivePacketPersonnelIds(): Promise<string[]>;
	findPacketReference(id: string): Promise<OnboardingPacketReference | null>;
	findStepReference(id: string): Promise<OnboardingProgressReference | null>;
	listActivePacketIdsForPersonnel(personnelId: string): Promise<string[]>;
	/** The Person's most recently started packet that was not cancelled. */
	findLatestPacketForPersonnel(personnelId: string): Promise<PersonnelOnboarding | null>;
	listIncompleteActiveStepIds(onboardingId: string): Promise<string[]>;
	saveCheckboxCompletion(stepId: string, completed: boolean): Promise<SavedOnboardingProgress>;
	savePaperworkProgress(stepId: string, currentStage: string, completed: boolean): Promise<SavedOnboardingProgress>;
	/** In-progress packets per template, counted among the packets the requester may see. Templates without packets map to 0. */
	countActivePacketsByTemplate(): Promise<Record<string, number>>;
}
