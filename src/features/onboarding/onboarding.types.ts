// ============================================================
// Onboarding
// ============================================================

export type OnboardingStepType = 'training' | 'paperwork' | 'checkbox';
export type OnboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OnboardingTemplate {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	createdAt: string;
}

export interface OnboardingTemplateStep {
	id: string;
	templateId: string;
	name: string;
	description: string | null;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
}

export interface OnboardingStepNote {
	text: string;
	timestamp: string;
}

export interface OnboardingStepProgress {
	id: string;
	onboardingId: string;
	stepName: string;
	stepType: OnboardingStepType;
	trainingTypeId: string | null;
	stages: string[] | null;
	sortOrder: number;
	completed: boolean;
	currentStage: string | null;
	notes: OnboardingStepNote[];
	templateStepId: string | null;
}

export interface PersonnelOnboarding {
	id: string;
	personnelId: string;
	startedAt: string;
	completedAt: string | null;
	status: OnboardingStatus;
	steps: OnboardingStepProgress[];
	templateId: string | null;
}
