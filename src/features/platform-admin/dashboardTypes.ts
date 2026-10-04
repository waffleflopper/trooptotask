import type { PlatformAuditDashboardActivity } from '$lib/audit/contracts';

export interface PlatformDashboard {
	userStats: { total: number; last_30_days: number };
	signupTrend: Array<{ date: string; count: number }>;
	totalOrganizations: number;
	pendingAccessRequests: number;
	pendingFeedback: number;
	recentActivity: PlatformAuditDashboardActivity[];
}
