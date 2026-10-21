import type { Personnel, Group } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	CalendarDateRange,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { TrainingSummary } from '$features/training/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
export type { TrainingIssue } from '$features/training/contracts';

export interface DashboardIctlMosReadiness {
	mos: string;
	personnelCount: number;
	readinessPercent: number;
}

export interface DashboardIctlTrendPoint {
	month: string;
	label: string;
	readinessPercent: number;
}

export interface DashboardIctlTaskConcern {
	taskId: string;
	taskCode: string;
	taskName: string;
	percentComplete: number;
	soldierGapCount: number;
}

export interface DashboardIctlAtRiskSoldier {
	personnelId: string;
	soldierName: string;
	mos: string;
	rank: string;
	groupName: string;
	readinessPercent: number;
	tasksExpiringSoonCount: number;
	daysSinceLastIctUpdate: number | null;
}

export interface DashboardIctlSummary {
	hasActiveTasks: boolean;
	overallReadinessPercent: number;
	overallDeltaPercent: number;
	readyCount: number;
	applicableCount: number;
	soldiersBelowThresholdCount: number;
	soldiersBelowThresholdTotal: number;
	thresholdPercent: number;
	expiringSoonCount: number;
	expiringSoonAffectedSoldiers: number;
	expiringSoonWindowDays: number;
	tasksBelowThresholdCount: number;
	projectedReadinessPercent: number;
	mosReadiness: DashboardIctlMosReadiness[];
	trend: DashboardIctlTrendPoint[];
	tasksBelowThreshold: DashboardIctlTaskConcern[];
	atRiskSoldiers: DashboardIctlAtRiskSoldier[];
}

export interface DashboardSetupSupport {
	trainingTypeCount: number;
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	starterConfigurationPacks: StarterConfigurationPackSupport[];
}

export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	/** Features off for the unit, from the app shell's Organization row. */
	disabledFeatures: readonly FeatureKey[];
	dashboard: DashboardWorkspaceResult;
	trainingSummary: TrainingSummary | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
	trainingTypeCount?: number;
	onboardingTemplateStepCount?: number;
	ratingSchemeEntryCount?: number;
	orgMemberCount?: number;
	gettingStartedDismissed?: boolean;
	starterConfigurationPacks?: StarterConfigurationPackSupport[];
	[key: string]: unknown;
}

export interface DashboardBootstrap {
	availabilityEntries: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	assignmentTypes: AssignmentType[];
	todayAssignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	/** The dates the availability and assignment snapshots cover. */
	range: CalendarDateRange;
	pinnedGroups: string[];
	ratingSchemeEntries: RatingSchemeDueEntry[];
	activeOnboardings: PersonnelOnboarding[];
	personnel: Personnel[];
	groups: Group[];
	statusTypes: StatusType[];
	trainingTypes: TrainingType[];
	/** Org-configured loss warning window in days (default: 180). */
	lossWarningWindowDays: number;
	/** Duty strength at or above this percent reads as healthy (default: 80). */
	strengthFloorPercent: number;
	/** Personnel IDs whose award tracking has been acknowledged. */
	awardTrackingAcknowledgedPersonnelIds: string[];
}

export const DASHBOARD_WORKSPACE_KEY = 'dashboard' as const;
export type DashboardWorkspaceData = DashboardBootstrap;

export type DashboardWorkspaceHydrationMode = 'replace' | 'preserve-client';

export type DashboardWorkspaceHydrationTarget<T> = {
	mode: DashboardWorkspaceHydrationMode;
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
};

/** A snapshot of the shared Calendar stores that is authoritative only within its date range. */
export type DashboardRangeHydrationTarget<T> = {
	mode: 'range' | 'preserve-client';
	deferred?: boolean;
	snapshotKey: string;
	items: T[] | Promise<T[]>;
	range: CalendarDateRange;
};

export interface DashboardAssignmentsHydrationItems {
	types: AssignmentType[];
	assignments: DailyAssignment[];
}

export type DashboardAssignmentsWorkspaceHydrationTarget = {
	mode: 'range' | 'preserve-client';
	deferred?: boolean;
	snapshotKey: string;
	items: DashboardAssignmentsHydrationItems | Promise<DashboardAssignmentsHydrationItems>;
	range: CalendarDateRange;
};

export interface DashboardWorkspaceHydration {
	orgId: string;
	/** Each tab's latest confirmed change when the request left; see `confirmedBeforeRequest`. */
	confirmedChangesByTab: Record<string, number>;
	personnel: DashboardWorkspaceHydrationTarget<Personnel>;
	groups: DashboardWorkspaceHydrationTarget<Group>;
	statusTypes: DashboardWorkspaceHydrationTarget<StatusType>;
	availabilityEntries: DashboardRangeHydrationTarget<AvailabilityEntry>;
	calendarAssignments: DashboardAssignmentsWorkspaceHydrationTarget;
	trainingTypes: DashboardWorkspaceHydrationTarget<TrainingType>;
	pinnedGroups: DashboardWorkspaceHydrationTarget<string>;
}

export interface DashboardWorkspaceResult {
	workspaceKey: typeof DASHBOARD_WORKSPACE_KEY;
	data: DashboardWorkspaceData;
	hydration: DashboardWorkspaceHydration;
}

import type { PolicyReasonCode } from '$lib/access/policyEvaluator';

export type StarterConfigurationPackId = 'first-week-operations';

export type StarterConfigurationPackArtifactFamilyId = 'training-types' | 'onboarding-template';

export interface StarterConfigurationPackArtifactPreview {
	family: StarterConfigurationPackArtifactFamilyId;
	label: string;
	names: string[];
	description: string;
}

export interface StarterConfigurationPackFamilyReadiness {
	family: StarterConfigurationPackArtifactFamilyId;
	label: string;
	configured: boolean;
	starterArtifactCount: number;
	expectedArtifactCount: number;
	existingStarterArtifactNames: string[];
}

export interface StarterConfigurationPackDeniedAction {
	id: string;
	label: string;
	reasonCode: PolicyReasonCode;
}

export interface StarterConfigurationPackSupport {
	id: StarterConfigurationPackId;
	name: string;
	description: string;
	editableCopy: string;
	artifacts: StarterConfigurationPackArtifactPreview[];
	readiness: StarterConfigurationPackFamilyReadiness[];
	canApply: boolean;
	deniedActions: StarterConfigurationPackDeniedAction[];
	isFullyApplied: boolean;
}

export interface StarterConfigurationPackResultItem {
	family: StarterConfigurationPackArtifactFamilyId;
	name: string;
}

export interface StarterConfigurationPackFailedItem extends StarterConfigurationPackResultItem {
	message: string;
}

export interface StarterConfigurationPackApplyResult {
	packId: StarterConfigurationPackId;
	packName: string;
	created: StarterConfigurationPackResultItem[];
	skipped: StarterConfigurationPackResultItem[];
	failed: StarterConfigurationPackFailedItem[];
}

export { formatDashboardDisplayDate } from './dashboardDate';
export interface DashboardPageSummaryData {
	trainingSummary: TrainingSummary | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
}
