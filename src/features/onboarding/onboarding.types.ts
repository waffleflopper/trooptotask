export type OnboardingStepType = 'training' | 'paperwork' | 'checkbox';
export type OnboardingStatus = 'in_progress' | 'completed' | 'cancelled';

export interface OnboardingTemplate {
	id: string;
	orgId: string;
	name: string;
	description: string | null;
	createdAt: string | null;
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
	userId: string;
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
	active: boolean;
	/** When `completed` or `currentStage` last changed; notes do not count. */
	progressChangedAt: string;
}

export interface PersonnelOnboarding {
	id: string;
	personnelId: string;
	startedAt: string;
	completedAt: string | null;
	cancelledAt: string | null;
	status: OnboardingStatus;
	steps: OnboardingStepProgress[];
	templateId: string | null;
}

/** One Person's latest non-cancelled packet, as the Personnel Readiness tab shows it. */
export type PersonnelOnboardingSummary =
	| { state: 'none' }
	| { state: 'in-progress'; startedAt: string; completedSteps: number; totalSteps: number }
	| { state: 'complete'; completedAt: string | null; completedSteps: number; totalSteps: number };

export type OnboardingBootstrapMode = 'all' | 'active' | 'history';
