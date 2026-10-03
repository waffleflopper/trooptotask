import type { PlatformAudit, PlatformAuditDashboardActivity } from '$lib/audit/contracts';

export interface PlatformAdministrationUserStats {
	total: number;
	last_30_days: number;
}

export interface PlatformAdministrationSignupTrendPoint {
	date: string;
	count: number;
}

export interface PlatformAdministrationDashboard {
	userStats: PlatformAdministrationUserStats;
	signupTrend: PlatformAdministrationSignupTrendPoint[];
	totalOrganizations: number;
	pendingAccessRequests: number;
	pendingFeedback: number;
	recentActivity: PlatformAuditDashboardActivity[];
}

export interface PlatformAdministrationStore {
	countPlatformUsers(): Promise<PlatformAdministrationUserStats | null>;
	listDailySignupsLast30Days(): Promise<PlatformAdministrationSignupTrendPoint[] | null>;
	countOrganizations(): Promise<number | null>;
	countPendingAccessRequests(): Promise<number | null>;
	countPendingFeedback(): Promise<number | null>;
}

export interface PlatformAdministrationDependencies {
	auditActivity: Pick<PlatformAudit, 'listRecentActivity'>;
	store: PlatformAdministrationStore;
}

export interface PlatformAdministration {
	dashboard(): Promise<PlatformAdministrationDashboard>;
}

const RECENT_ACTIVITY_LIMIT = 10;
const DEFAULT_USER_STATS: PlatformAdministrationUserStats = { total: 0, last_30_days: 0 };

/** Retained Dashboard composition; D22 owns this remaining global path. */
export function createPlatformAdministration(deps: PlatformAdministrationDependencies): PlatformAdministration {
	return {
		async dashboard() {
			const [userStats, signupTrend, totalOrganizations, pendingAccessRequests, pendingFeedback, recentActivity] =
				await Promise.all([
					deps.store.countPlatformUsers(),
					deps.store.listDailySignupsLast30Days(),
					deps.store.countOrganizations(),
					deps.store.countPendingAccessRequests(),
					deps.store.countPendingFeedback(),
					deps.auditActivity.listRecentActivity({ limit: RECENT_ACTIVITY_LIMIT })
				]);

			return {
				userStats: userStats ?? DEFAULT_USER_STATS,
				signupTrend: signupTrend ?? [],
				totalOrganizations: totalOrganizations ?? 0,
				pendingAccessRequests: pendingAccessRequests ?? 0,
				pendingFeedback: pendingFeedback ?? 0,
				recentActivity
			};
		}
	};
}
