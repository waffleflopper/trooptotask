import { describe, expect, it, vi } from 'vitest';
import { createPlatformDashboard, type PlatformDashboardDependencies } from './dashboard.server';

function dependencies(): PlatformDashboardDependencies {
	return {
		identity: {
			countPlatformUsers: async () => ({ total: 12, last30Days: 3 }),
			listDailySignupsLast30Days: async () => [{ date: '2026-06-01', count: 2 }],
			countPendingAccessRequests: async () => 5
		},
		organizations: { countOrganizations: async () => 4 },
		feedback: { countPendingFeedback: async () => 6 },
		auditActivity: {
			listRecentActivity: async () => [
				{ id: 'event-1', action: 'admin.login', user_id: null, timestamp: '2026-06-01T11:00:00Z' }
			]
		}
	};
}

describe('Platform Dashboard composition', () => {
	it('combines source-owned statistics, queues and reduced activity in the retained page model', async () => {
		await expect(createPlatformDashboard(dependencies()).dashboard()).resolves.toEqual({
			userStats: { total: 12, last_30_days: 3 },
			signupTrend: [{ date: '2026-06-01', count: 2 }],
			totalOrganizations: 4,
			pendingAccessRequests: 5,
			pendingFeedback: 6,
			recentActivity: [{ id: 'event-1', action: 'admin.login', user_id: null, timestamp: '2026-06-01T11:00:00Z' }]
		});
	});
	it('retains genuine zero counts and empty activity without inventing unavailable facts', async () => {
		const deps = dependencies();
		deps.identity = {
			countPlatformUsers: async () => ({ total: 0, last30Days: 0 }),
			listDailySignupsLast30Days: async () => [],
			countPendingAccessRequests: async () => 0
		};
		deps.organizations.countOrganizations = async () => 0;
		deps.feedback.countPendingFeedback = async () => 0;
		deps.auditActivity.listRecentActivity = async () => [];
		await expect(createPlatformDashboard(deps).dashboard()).resolves.toEqual({
			userStats: { total: 0, last_30_days: 0 },
			signupTrend: [],
			totalOrganizations: 0,
			pendingAccessRequests: 0,
			pendingFeedback: 0,
			recentActivity: []
		});
	});
	it('does not report an empty activity feed when the Audit read fails', async () => {
		const deps = dependencies();
		deps.auditActivity.listRecentActivity = vi.fn().mockRejectedValue(new Error('Audit unavailable'));
		await expect(createPlatformDashboard(deps).dashboard()).rejects.toThrow('Audit unavailable');
	});
});
