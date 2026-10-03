import type { Group, OrganizationRankCatalogEntry } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { Personnel } from '$features/personnel/contracts';
export { getProgress } from './onboardingProgress';
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding,
	OnboardingStepNote,
	OnboardingStatus
} from './onboarding.types';
export type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding,
	OnboardingStepType,
	OnboardingStepProgress,
	OnboardingStepNote,
	OnboardingStatus
} from './onboarding.types';

/** Only the active Personnel IDs needed for Calendar's onboarding markers. */
export interface OnboardingCalendarMarkersPort {
	listActivePersonnelIds(orgId: string): Promise<string[]>;
}

export const ONBOARDING_WORKSPACE_LANE_KEY = 'onboarding' as const;
export type OnboardingBootstrapMode = 'all' | 'active' | 'history';
export interface OnboardingBootstrap {
	onboardingTemplates: OnboardingTemplate[];
	onboardingTemplateSteps: OnboardingTemplateStep[];
	onboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	trainingTypes: TrainingType[];
	rankCatalog: OrganizationRankCatalogEntry[];
	rankCatalogUnavailable: boolean;
}
export type OnboardingWorkspaceData = OnboardingBootstrap;
export type OnboardingWorkspaceHydrationMode = 'replace' | 'preserve-client';
export interface OnboardingWorkspaceHydrationTarget<T> {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
}
export interface OnboardingTemplatesWorkspaceHydrationTarget {
	mode: OnboardingWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	templates: OnboardingTemplate[];
	steps: OnboardingTemplateStep[];
}
export interface OnboardingWorkspaceHydration {
	orgId: string;
	personnel: OnboardingWorkspaceHydrationTarget<Personnel>;
	groups: OnboardingWorkspaceHydrationTarget<Group>;
	trainingTypes: OnboardingWorkspaceHydrationTarget<TrainingType>;
	onboardingTemplates: OnboardingTemplatesWorkspaceHydrationTarget;
	onboardings: OnboardingWorkspaceHydrationTarget<PersonnelOnboarding>;
}
export interface OnboardingWorkspaceResult {
	laneKey: typeof ONBOARDING_WORKSPACE_LANE_KEY;
	data: OnboardingWorkspaceData;
	hydration: OnboardingWorkspaceHydration;
}
export interface OnboardingWorkspaceRouteData {
	[ONBOARDING_WORKSPACE_LANE_KEY]: {
		data: Promise<OnboardingWorkspaceResult>;
	};
}

/** Saved progress returned by the atomic packet reconciliation, including inactive history. */
export interface OnboardingReconciliationStepRow {
	id: string;
	onboarding_id: string;
	template_step_id: string | null;
	step_name: string;
	step_type: string;
	training_type_id: string | null;
	stages: string[] | null;
	sort_order: number;
	completed: boolean;
	current_stage: string | null;
	notes: Array<{ text: string; timestamp: string; userId: string }>;
	active: boolean;
}

export interface OnboardingReconciliationResult {
	onboarding_id: string;
	template_id: string;
	old_template_id: string | null;
	steps: OnboardingReconciliationStepRow[];
}

export interface OnboardingReconciliationPort {
	/** Null selects the packet's current template while holding its database lock. */
	reconcile(
		organizationId: string,
		onboardingId: string,
		newTemplateId: string | null
	): Promise<OnboardingReconciliationResult>;
}

/** Authoritative saved notes after one atomic database append. */
export interface OnboardingNoteAppendResult {
	id: string;
	notes: OnboardingStepNote[];
}

export interface OnboardingNoteAppendPort {
	/** Attribution and timestamp come from the ordinary authenticated database request. */
	append(organizationId: string, stepId: string, text: string): Promise<OnboardingNoteAppendResult>;
}

export type OnboardingLifecycleTransition =
	| { kind: 'cancel'; at: string }
	| { kind: 'complete'; at: string }
	| { kind: 'reopen' };

/** Only the saved parent fields consumed by lifecycle responses. */
export interface OnboardingLifecycleTransitionResult {
	id: string;
	status: OnboardingStatus;
	cancelled_at: string | null;
	completed_at: string | null;
}

export interface OnboardingLifecycleTransitionPort {
	/** Null means the parent no longer matches this transition's required status. */
	transition(
		organizationId: string,
		onboardingId: string,
		command: OnboardingLifecycleTransition
	): Promise<OnboardingLifecycleTransitionResult | null>;
}

export interface OnboardingInactiveStepRemovalPort {
	/** Null means no row still matches the inactive-only deletion predicate. */
	remove(organizationId: string, stepId: string): Promise<{ id: string } | null>;
}

/** Prepared catalog snapshots; fresh identities and workflow defaults belong to creation. */
export interface OnboardingStartStepSnapshot extends Pick<
	OnboardingReconciliationStepRow,
	'step_name' | 'step_type' | 'training_type_id' | 'stages' | 'sort_order' | 'completed'
> {
	template_step_id: string;
}

export interface OnboardingPacketCreationInput {
	personnelId: string;
	templateId: string;
	startedAt: string;
	steps: OnboardingStartStepSnapshot[];
}

/** Authoritative saved parent and snapshots from one creation transaction. */
export interface OnboardingPacketCreationResult {
	onboarding: {
		id: string;
		personnel_id: string;
		template_id: string;
		status: OnboardingStatus;
		started_at: string;
		completed_at: string | null;
		cancelled_at: string | null;
	};
	steps: OnboardingReconciliationStepRow[];
}

export interface OnboardingPacketCreationPort {
	/** Save the new packet and all prepared steps together, or save neither. */
	create(organizationId: string, input: OnboardingPacketCreationInput): Promise<OnboardingPacketCreationResult>;
}

export type { OnboardingSupportReader } from './supportReadTypes';
