import type { DashboardWorkspaceResult } from './server/dashboardWorkspaceBootstrap';
import type { TrainingStats } from '$features/training/utils/trainingStatus';

export interface TrainingIssue {
	personName: string;
	typeName: string;
	status: string;
	label: string;
}

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

// Shape of page data from (dashboard)/+layout.server.ts + +page.server.ts
export interface DashboardPageData {
	orgId: string;
	orgName: string;
	userId: string | null;
	dashboard: DashboardWorkspaceResult;
	trainingSummary: { stats: TrainingStats; issues: TrainingIssue[] } | null;
	ictlSummary: DashboardIctlSummary | null;
	onboardingTrainingCompletions: string[];
	onboardingTemplateStepCount?: number;
	ratingSchemeEntryCount?: number;
	orgMemberCount?: number;
	dutyRosterTemplateCount?: number;
	dutyRosterRunCount?: number;
	gettingStartedDismissed?: boolean;
	[key: string]: unknown;
}
