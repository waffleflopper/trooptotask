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

export interface OnboardingStarterReadiness {
	template: SavedOnboardingTemplate | null;
	hasAnyTemplate: boolean;
	hasAnyStep: boolean;
	stepNames: string[];
}

export interface OnboardingCatalogPersistence {
	listTemplates(): Promise<SavedOnboardingTemplate[]>;
	listSteps(templateId?: string): Promise<SavedOnboardingTemplateStep[]>;
	findTemplate(id: string): Promise<SavedOnboardingTemplate | null>;
	findTemplateByName(name: string): Promise<SavedOnboardingTemplate | null>;
	findStep(id: string): Promise<SavedOnboardingTemplateStep | null>;
	findStepByTemplateAndName(templateId: string, name: string): Promise<SavedOnboardingTemplateStep | null>;
	readStarterReadiness(templateName: string, stepNames: readonly string[]): Promise<OnboardingStarterReadiness>;
	countEstimatedSteps(): Promise<number>;
	createTemplate(data: OnboardingTemplateData): Promise<SavedOnboardingTemplate>;
	updateTemplate(id: string, data: Partial<OnboardingTemplateData>): Promise<SavedOnboardingTemplate>;
	deleteTemplate(id: string): Promise<void>;
	createStep(data: PreparedOnboardingTemplateStep): Promise<SavedOnboardingTemplateStep>;
	createSteps(data: readonly OnboardingTemplateStepData[]): Promise<SavedOnboardingTemplateStep[]>;
	updateStep(id: string, data: Partial<OnboardingTemplateStepData>): Promise<SavedOnboardingTemplateStep>;
	deleteStep(id: string): Promise<void>;
	deleteStepsForTemplate(templateId: string): Promise<void>;
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
}

export interface OnboardingWorkflowPersistence {
	listPackets(mode: OnboardingBootstrapMode): Promise<PersonnelOnboarding[]>;
	listSavedActivePackets(): Promise<PersonnelOnboarding[]>;
	findPacketReference(id: string): Promise<OnboardingPacketReference | null>;
	findStepReference(id: string): Promise<OnboardingProgressReference | null>;
	listActivePacketIdsForPersonnel(personnelId: string): Promise<string[]>;
	listIncompleteActiveStepIds(onboardingId: string): Promise<string[]>;
	saveCheckboxCompletion(stepId: string, completed: boolean): Promise<SavedOnboardingProgress>;
	savePaperworkProgress(stepId: string, currentStage: string, completed: boolean): Promise<SavedOnboardingProgress>;
	listPacketIdsUsingTemplate(templateId: string): Promise<string[]>;
	/** In-progress packets per template, counted among the packets the requester may see. Templates without packets map to 0. */
	countActivePacketsByTemplate(templateIds: string[]): Promise<Record<string, number>>;
	clearPacketTemplate(id: string): Promise<void>;
}
