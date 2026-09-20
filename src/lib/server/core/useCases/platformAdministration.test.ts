import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createPlatformAdministration,
	type PlatformAdministrationDependencies,
	type PlatformAdministrationStore
} from './platformAdministration';

const VALID_USER_ID = '11111111-1111-1111-1111-111111111111';
const VALID_ORG_ID = '22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-06-01T12:00:00.000Z');

function makeStore(overrides: Partial<PlatformAdministrationStore> = {}): PlatformAdministrationStore {
	return {
		countPlatformUsers: vi.fn().mockResolvedValue({ total: 12, last_30_days: 3 }),
		listDailySignupsLast30Days: vi.fn().mockResolvedValue([{ date: '2026-06-01', count: 2 }]),
		countOrganizations: vi.fn().mockResolvedValue(4),
		countPendingAccessRequests: vi.fn().mockResolvedValue(5),
		countPendingFeedback: vi.fn().mockResolvedValue(6),
		listRecentActivity: vi
			.fn()
			.mockResolvedValue([
				{ id: 'event-1', action: 'admin.login', user_id: null, timestamp: '2026-06-01T11:00:00.000Z' }
			]),
		searchUsersByEmail: vi.fn().mockResolvedValue([{ id: VALID_USER_ID, email: 'leader@example.mil' }]),
		countOrganizationsForUser: vi.fn().mockResolvedValue(2),
		searchOrganizationsByName: vi.fn().mockResolvedValue([{ id: VALID_ORG_ID, name: 'Alpha Company' }]),
		countActivePersonnelForOrganization: vi.fn().mockResolvedValue(42),
		suspendUser: vi.fn().mockResolvedValue(undefined),
		unsuspendUser: vi.fn().mockResolvedValue(undefined),
		suspendOrganization: vi.fn().mockResolvedValue(undefined),
		unsuspendOrganization: vi.fn().mockResolvedValue(undefined),
		...overrides
	};
}

function makeDeps(overrides: Partial<PlatformAdministrationDependencies> = {}) {
	const store = overrides.store ?? makeStore();
	const deps: PlatformAdministrationDependencies = {
		store,
		actorUserId: overrides.actorUserId ?? 'admin-1',
		audit: overrides.audit ?? vi.fn(),
		now: overrides.now ?? (() => NOW)
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
		const { admin, store } = makeDeps();

		const dashboard = await admin.dashboard();

		expect(dashboard).toMatchObject({
			userStats: { total: 12, last_30_days: 3 },
			signupTrend: [{ date: '2026-06-01', count: 2 }],
			totalOrganizations: 4,
			pendingAccessRequests: 5,
			pendingFeedback: 6,
			recentActivity: [{ id: 'event-1' }]
		});
		expect(store.listRecentActivity).toHaveBeenCalledWith(10);
	});

	it('uses dashboard defaults when nullable provider reads return null', async () => {
		const { admin } = makeDeps({
			store: makeStore({
				countPlatformUsers: vi.fn().mockResolvedValue(null),
				listDailySignupsLast30Days: vi.fn().mockResolvedValue(null),
				countOrganizations: vi.fn().mockResolvedValue(null),
				countPendingAccessRequests: vi.fn().mockResolvedValue(null),
				countPendingFeedback: vi.fn().mockResolvedValue(null),
				listRecentActivity: vi.fn().mockResolvedValue([])
			})
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

	it('returns empty search results without provider calls when the query is too short', async () => {
		const { admin, store } = makeDeps();

		const result = await admin.search({ query: 'ab' });

		expect(result).toEqual({ users: [], organizations: [] });
		expect(store.searchUsersByEmail).not.toHaveBeenCalled();
		expect(store.searchOrganizationsByName).not.toHaveBeenCalled();
	});

	it('searches users and Organizations, then enriches the result counts', async () => {
		const { admin, store } = makeDeps();

		const result = await admin.search({ query: '  alpha   company  ' });

		expect(store.searchUsersByEmail).toHaveBeenCalledWith({ query: 'alpha company', maxResults: 5 });
		expect(store.searchOrganizationsByName).toHaveBeenCalledWith({ query: 'alpha company', maxResults: 5 });
		expect(result).toEqual({
			users: [{ id: VALID_USER_ID, email: 'leader@example.mil', orgCount: 2 }],
			organizations: [{ id: VALID_ORG_ID, name: 'Alpha Company', personnelCount: 42 }]
		});
	});

	it('suspends a User Account and audits the Platform Administration command', async () => {
		const { admin, store, deps } = makeDeps();

		await expect(
			admin.updateSuspension({
				type: 'user',
				targetId: VALID_USER_ID,
				action: 'suspend',
				reason: ' Policy violation '
			})
		).resolves.toEqual({ success: true });

		expect(store.suspendUser).toHaveBeenCalledWith({
			userId: VALID_USER_ID,
			suspendedBy: 'admin-1',
			reason: 'Policy violation'
		});
		expect(deps.audit).toHaveBeenCalledWith({
			action: 'suspend_user',
			resourceType: 'user',
			resourceId: VALID_USER_ID,
			details: { reason: 'Policy violation' },
			severity: 'critical'
		});
	});

	it('unsuspends an Organization and audits with the existing action shape', async () => {
		const { admin, store, deps } = makeDeps();

		await admin.updateSuspension({ type: 'org', targetId: VALID_ORG_ID, action: 'unsuspend' });

		expect(store.unsuspendOrganization).toHaveBeenCalledWith(VALID_ORG_ID);
		expect(deps.audit).toHaveBeenCalledWith({
			action: 'unsuspend_org',
			resourceType: 'organization',
			resourceId: VALID_ORG_ID,
			details: { reason: undefined },
			severity: 'critical'
		});
	});

	it('does not audit or report success when a suspension adapter rejects', async () => {
		const audit = vi.fn();
		const store = makeStore({
			unsuspendOrganization: vi.fn().mockRejectedValue(new Error('table organizations unsuspend update failed'))
		});
		const { admin } = makeDeps({ store, audit });

		await expect(admin.updateSuspension({ type: 'org', targetId: VALID_ORG_ID, action: 'unsuspend' })).rejects.toThrow(
			'table organizations unsuspend update failed'
		);

		expect(store.unsuspendOrganization).toHaveBeenCalledWith(VALID_ORG_ID);
		expect(audit).not.toHaveBeenCalled();
	});

	it('rejects malformed suspension commands before calling the store', async () => {
		const { admin, store } = makeDeps();

		await expect(
			admin.updateSuspension({ type: 'user', targetId: 'not-a-uuid', action: 'suspend' })
		).rejects.toMatchObject({ status: 400 });

		expect(store.suspendUser).not.toHaveBeenCalled();
		expect(store.suspendOrganization).not.toHaveBeenCalled();
	});
});
