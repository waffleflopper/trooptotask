export type PlatformActivationHealthState = 'activated' | 'in_progress' | 'no_candidates' | 'diagnostics_unavailable';

export type PlatformActivationMilestoneId =
	| 'signup_submitted'
	| 'email_confirmed'
	| 'organization_created'
	| 'meaningful_roster'
	| 'leader_accepted'
	| 'defaults_present'
	| 'setup_started';

export type PlatformActivationMilestoneState = 'complete' | 'incomplete' | 'deferred';

export interface PlatformActivationSetupCounts {
	activePersonnel: number;
	members: number;
	leaderMembers: number;
	statusTypes: number;
	assignmentTypes: number;
	onboardingTemplateSteps: number;
	trainingTypes: number;
	ratingSchemeEntries: number;
}

export interface PlatformActivationOrganizationFacts {
	organizationId: string;
	organizationName: string | null;
	organizationCreatedAt: string | null;
	counts: PlatformActivationSetupCounts;
}

export interface PlatformActivationMilestone {
	id: PlatformActivationMilestoneId;
	label: string;
	state: PlatformActivationMilestoneState;
	detail: string;
}

export interface PlatformActivationSupportBundle {
	organizationId: string;
	organizationName: string | null;
	acquisition: {
		organizationCreatedAt: string | null;
	};
	activation: PlatformActivationSetupCounts & {
		meaningfulRosterThreshold: number;
	};
	nextSteps: string[];
}

export interface PlatformActivationOrganizationHealth {
	id: string;
	organization: { id: string; name: string | null };
	state: PlatformActivationHealthState;
	score: number;
	milestones: PlatformActivationMilestone[];
	nextSteps: string[];
	supportBundle: PlatformActivationSupportBundle;
}

export interface PlatformActivationHealthSummary {
	generatedAt: string;
	overallState: PlatformActivationHealthState;
	candidateLimit: number;
	counts: {
		candidateOrganizations: number;
		activatedOrganizations: number;
		meaningfulRosters: number;
		acceptedLeaders: number;
		setupStarted: number;
		inProgressOrganizations: number;
	};
	organizations: PlatformActivationOrganizationHealth[];
	diagnosticsError: boolean;
}

export interface PlatformActivationHealthStore {
	listActivationOrganizationFacts(input: { limit: number }): Promise<PlatformActivationOrganizationFacts[]>;
}

export interface PlatformActivationHealth {
	summarize(input?: { now?: Date }): Promise<PlatformActivationHealthSummary>;
}

export interface PlatformActivationHealthDependencies {
	store: PlatformActivationHealthStore;
	now?: () => Date;
}
