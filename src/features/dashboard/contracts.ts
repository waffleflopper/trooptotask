import type { Personnel, Group } from '$features/personnel/contracts';
import type {
	AssignmentType,
	AvailabilityEntry,
	CalendarDateRange,
	SpecialDay,
	StatusType,
	DailyAssignment
} from '$features/calendar/contracts';
import type { TrainingType } from '$features/training/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { TrainingSummary } from '$features/training/contracts';
import type { CalendarProjection, TaskingAttentionProjection } from '$features/calendar/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';

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
	/** At or above the threshold with a task expiring soon; never counted below it too. */
	soldiersAtRiskCount: number;
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

/** The viewer's calendar day and IANA zone from the page load; the Dashboard's only "today". */
export interface DashboardViewerDay {
	date: string;
	timeZone: string;
}

/** The strength forecast's columns: the viewer's day and the 13 after it. */
export const FORECAST_DAYS = 14;

/** One read feeds the Tasking rows in Needs you and the forecast's Events & Taskings lane. */
export interface DashboardTaskings {
	attention: TaskingAttentionProjection;
	/** Events overlapping the forecast's days and the suspenses due in them, as the reader may see them. */
	forecast: Pick<CalendarProjection, 'events' | 'suspenses'>;
}

/** Tasking attention loads on its own: `off` is not read for this unit or viewer, and `failed` is not empty. */
export type DashboardTaskingsState =
	| { status: 'off' }
	| { status: 'pending' }
	| { status: 'failed' }
	| ({ status: 'ready' } & DashboardTaskings);

export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	viewerDay: DashboardViewerDay;
	/** Features off for the unit, from the app shell's Organization row. */
	disabledFeatures: readonly FeatureKey[];
	dashboard: DashboardWorkspaceResult;
	trainingSummary: TrainingSummary | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
	/** The summary read failed, so a null summary above is unknown rather than withheld. */
	summaryFailed: boolean;
	taskings: DashboardTaskingsState;
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
	/** False until the unit saves its first Onboarding template; Onboarding is then not set up. */
	hasAnyOnboardingTemplate: boolean;
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
	/** Stored federal holidays and closures within `range`; the forecast never flags them. */
	specialDays: SpecialDay[];
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

export type StarterConfigurationPackId = 'first-week-operations';

export type StarterConfigurationPackArtifactFamilyId = 'training-types' | 'onboarding-template';

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

export { formatDashboardDisplayDate, formatDashboardTitleDate } from './dashboardDate';
export interface DashboardPageSummaryData {
	trainingSummary: TrainingSummary | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
	/** The people whose active Onboarding the completion read covered; empty when Training was not read. */
	onboardingPersonnelIds: string[];
}
