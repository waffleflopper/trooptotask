import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createPlatformAdministration,
	type PlatformAdministrationDependencies,
	type PlatformAdministrationStore
} from './platformAdministration';

function makeStore(overrides: Partial<PlatformAdministrationStore> = {}): PlatformAdministrationStore {
	return {
		countPlatformUsers: vi.fn().mockResolvedValue({ total: 12, last_30_days: 3 }),
		listDailySignupsLast30Days: vi.fn().mockResolvedValue([{ date: '2026-06-01', count: 2 }]),
		countOrganizations: vi.fn().mockResolvedValue(4),
		countPendingAccessRequests: vi.fn().mockResolvedValue(5),
		countPendingFeedback: vi.fn().mockResolvedValue(6),
		...overrides
	};
}

function makeDeps(overrides: Partial<PlatformAdministrationDependencies> = {}) {
	const store = overrides.store ?? makeStore();
	const deps: PlatformAdministrationDependencies = {
		store,
		auditActivity: overrides.auditActivity ?? {
			listRecentActivity: vi
				.fn()
				.mockResolvedValue([
					{ id: 'event-1', action: 'admin.login', user_id: null, timestamp: '2026-06-01T11:00:00.000Z' }
				])
		}
	};
	return {
		deps,
		store,
		admin: createPlatformAdministration(deps)
	};
}

describe('Platform Administration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('builds dashboard usage, review queues and audit activity', async () => {
		const { admin, deps } = makeDeps();

		const dashboard = await admin.dashboard();

		expect(dashboard).toMatchObject({
			userStats: { total: 12, last_30_days: 3 },
			signupTrend: [{ date: '2026-06-01', count: 2 }],
			totalOrganizations: 4,
			pendingAccessRequests: 5,
			pendingFeedback: 6,
			recentActivity: [{ id: 'event-1' }]
		});
		expect(deps.auditActivity.listRecentActivity).toHaveBeenCalledWith({ limit: 10 });
	});

	it('uses dashboard defaults when nullable provider reads return null', async () => {
		const { admin } = makeDeps({
			store: makeStore({
				countPlatformUsers: vi.fn().mockResolvedValue(null),
				listDailySignupsLast30Days: vi.fn().mockResolvedValue(null),
				countOrganizations: vi.fn().mockResolvedValue(null),
				countPendingAccessRequests: vi.fn().mockResolvedValue(null),
				countPendingFeedback: vi.fn().mockResolvedValue(null)
			}),
			auditActivity: { listRecentActivity: vi.fn().mockResolvedValue([]) }
		});

		await expect(admin.dashboard()).resolves.toMatchObject({
			userStats: { total: 0, last_30_days: 0 },
			signupTrend: [],
			totalOrganizations: 0,
			pendingAccessRequests: 0,
			pendingFeedback: 0,
			recentActivity: []
		});
	});

	it('does not report an empty activity feed when the Audit read fails', async () => {
		const { admin } = makeDeps({
			auditActivity: { listRecentActivity: vi.fn().mockRejectedValue(new Error('Audit unavailable')) }
		});

		await expect(admin.dashboard()).rejects.toThrow('Audit unavailable');
	});
});
