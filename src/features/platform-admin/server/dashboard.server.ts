import type { PlatformAudit } from '$lib/audit/contracts';
import type { IdentityPlatformDashboardReader } from '$features/identity/contracts';
import type { OrganizationSupportReader } from '$features/organization/contracts';
import type { PlatformDashboard } from '../dashboardTypes';

export interface PlatformDashboardDependencies {
	identity: IdentityPlatformDashboardReader;
	organizations: Pick<OrganizationSupportReader, 'countOrganizations'>;
	feedback: { countPendingFeedback(): Promise<number> };
	auditActivity: Pick<PlatformAudit, 'listRecentActivity'>;
}

export function createPlatformDashboard(deps: PlatformDashboardDependencies) {
	return {
		async dashboard(): Promise<PlatformDashboard> {
			const [userStats, signupTrend, totalOrganizations, pendingAccessRequests, pendingFeedback, recentActivity] =
				await Promise.all([
					deps.identity.countPlatformUsers(),
					deps.identity.listDailySignupsLast30Days(),
					deps.organizations.countOrganizations(),
					deps.identity.countPendingAccessRequests(),
					deps.feedback.countPendingFeedback(),
					deps.auditActivity.listRecentActivity({ limit: 10 })
				]);
			return {
				userStats: { total: userStats.total, last_30_days: userStats.last30Days },
				signupTrend,
				totalOrganizations,
				pendingAccessRequests,
				pendingFeedback,
				recentActivity
			};
		}
	};
}
