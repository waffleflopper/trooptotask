import { describe, expect, it, vi } from 'vitest';
import { getDefaultUserOrgPreferences } from '$features/identity/contracts';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	MembershipInfo,
	OrgAccessPort,
	OrgState,
	OrganizationSwitcherOrg
} from './contracts';
import { loadAppShellDeferredChrome, loadAppShellFirstPaint } from './appShellRead.server';

function createInMemoryOrgAccessPort(config: { membership: MembershipInfo; orgState: OrgState }): OrgAccessPort {
	return {
		getMembership: () => Promise.resolve(config.membership),
		getOrgState: () => Promise.resolve(config.orgState)
	};
}

function createInMemoryAppShellFirstPaintChromePort(config: {
	chrome: AppShellFirstPaintChrome;
}): AppShellFirstPaintChromePort {
	return {
		getFirstPaintChrome: () => Promise.resolve(config.chrome)
	};
}

function createInMemoryAppShellDeferredChromePort(config: {
	unreadNotificationCount: number;
	organizations: OrganizationSwitcherOrg[];
}): AppShellDeferredChromePort {
	return {
		getUnreadNotificationCount: () => Promise.resolve(config.unreadNotificationCount),
		getOrganizationSwitcherOrgs: () => Promise.resolve(config.organizations)
	};
}

const membership: MembershipInfo = {
	orgId: 'org-1',
	membershipId: 'membership-1',
	userId: 'user-1',
	role: 'member',
	capabilityMap: {
		calendar: 'view',
		personnel: 'view',
		training: 'view',
		criticalTasks: 'view',
		onboarding: 'none',
		ratingScheme: 'none'
	},
	scopeSet: { kind: 'organization' }
};

const orgState: OrgState = {
	orgName: 'Test Unit',
	disabledFeatures: []
};

describe('loadAppShellFirstPaint', () => {
	it('starts all first-paint reads before any settles and excludes deferred chrome', async () => {
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started: string[] = [];
		const read = async <T>(name: string, value: T): Promise<T> => {
			started.push(name);
			await held;
			return value;
		};
		const pending = loadAppShellFirstPaint({
			kind: 'ready',
			orgUrlSegment: 'test-unit',
			access: {
				getMembership: () => read('membership', membership),
				getOrgState: () => read('organization', orgState)
			},
			chrome: {
				getFirstPaintChrome: () =>
					read('first-paint', {
						announcements: [],
						preferences: getDefaultUserOrgPreferences(),
						account: { email: null, profile: { status: 'loaded' as const, profile: null } }
					})
			}
		});
		try {
			expect(new Set(started)).toEqual(new Set(['membership', 'organization', 'first-paint']));
		} finally {
			release();
		}
		expect((await pending).shell).toMatchObject({ user: { id: 'user-1' } });
	});
	it('returns only the shell envelope for the ready path', async () => {
		const result = await loadAppShellFirstPaint({
			kind: 'ready',
			orgUrlSegment: 'test-unit',
			access: createInMemoryOrgAccessPort({ membership, orgState }),
			chrome: createInMemoryAppShellFirstPaintChromePort({
				chrome: {
					announcements: [{ id: 'a1', title: 'Heads up', message: 'Read this', type: 'info' }],
					preferences: getDefaultUserOrgPreferences(),
					account: {
						email: 'dana@example.test',
						profile: { status: 'loaded', profile: { rank: 'SFC', firstName: 'Dana', lastName: 'Whitaker' } }
					}
				}
			})
		});

		expect(result).toEqual({
			shell: expect.objectContaining({
				kind: 'ready',
				org: { id: 'org-1', name: 'Test Unit', urlSegment: 'test-unit', disabledFeatures: [] },
				user: {
					id: 'user-1',
					email: 'dana@example.test',
					profile: { status: 'loaded', profile: { rank: 'SFC', firstName: 'Dana', lastName: 'Whitaker' } }
				},
				member: expect.objectContaining({
					membershipId: 'membership-1',
					role: 'member',
					capabilityMap: membership.capabilityMap,
					scopeSet: membership.scopeSet
				}),
				state: expect.objectContaining({
					orgSuspended: false
				}),
				announcements: [{ id: 'a1', title: 'Heads up', message: 'Read this', type: 'info' }]
			})
		});
		expect(result).not.toHaveProperty('orgId');
		expect(result).not.toHaveProperty('allOrgs');
		expect(result).not.toHaveProperty('unreadNotificationCount');
	});

	it('returns the suspended shell shape without legacy top-level fields', async () => {
		const result = await loadAppShellFirstPaint({
			kind: 'suspended',
			orgId: 'org-1',
			orgName: 'Suspended Unit',
			orgUrlSegment: 'suspended-unit'
		});

		expect(result).toEqual({
			shell: {
				kind: 'suspended',
				org: { id: 'org-1', name: 'Suspended Unit', urlSegment: 'suspended-unit' },
				state: { orgSuspended: true }
			}
		});
		expect(result).not.toHaveProperty('orgSuspended');
	});
});

describe('loadAppShellDeferredChrome', () => {
	it.each(['notification-count', 'organization-switcher'] as const)('reads only requested %s chrome', async (part) => {
		const notifications = vi.fn(async () => 4);
		const organizations = vi.fn(async () => [{ id: 'org-2', name: 'Other', role: 'member' }]);
		await loadAppShellDeferredChrome(part, {
			getUnreadNotificationCount: notifications,
			getOrganizationSwitcherOrgs: organizations
		});
		expect(part === 'notification-count' ? organizations : notifications).not.toHaveBeenCalled();
	});
	it('loads notification count separately from first paint', async () => {
		const result = await loadAppShellDeferredChrome(
			'notification-count',
			createInMemoryAppShellDeferredChromePort({
				unreadNotificationCount: 4,
				organizations: []
			})
		);

		expect(result).toEqual({ part: 'notification-count', ok: true, unreadNotificationCount: 4 });
	});

	it('loads the organization switcher separately from first paint', async () => {
		const result = await loadAppShellDeferredChrome(
			'organization-switcher',
			createInMemoryAppShellDeferredChromePort({
				unreadNotificationCount: 0,
				organizations: [{ id: 'org-1', name: 'Test Unit', role: 'owner', urlSegment: 'test-unit' }]
			})
		);

		expect(result).toEqual({
			part: 'organization-switcher',
			ok: true,
			organizations: [{ id: 'org-1', name: 'Test Unit', role: 'owner', urlSegment: 'test-unit' }]
		});
	});

	it('hides backend error details from notification-count failures', async () => {
		const cause = new Error('relation "notifications" does not exist');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const result = await loadAppShellDeferredChrome('notification-count', {
				getUnreadNotificationCount: () => Promise.reject(cause),
				getOrganizationSwitcherOrgs: () => Promise.resolve([])
			});

			expect(result).toEqual({
				part: 'notification-count',
				ok: false,
				reason: 'Unable to load app shell chrome'
			});
			if (!result.ok) {
				expect(result.reason).not.toContain('notifications');
				expect(result.reason).not.toContain('relation');
				expect(result.reason).not.toContain(cause.message);
			}
			expect(consoleError).toHaveBeenCalledWith(
				"[app-shell] Failed to load deferred chrome part 'notification-count':",
				cause
			);
		} finally {
			consoleError.mockRestore();
		}
	});

	it('hides backend error details from organization-switcher failures', async () => {
		const cause = new Error('Failed to load organization memberships: policy denied');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const result = await loadAppShellDeferredChrome('organization-switcher', {
				getUnreadNotificationCount: () => Promise.resolve(0),
				getOrganizationSwitcherOrgs: () => Promise.reject(cause)
			});

			expect(result).toEqual({
				part: 'organization-switcher',
				ok: false,
				reason: 'Unable to load app shell chrome'
			});
			if (!result.ok) {
				expect(result.reason).not.toContain('memberships');
				expect(result.reason).not.toContain('policy');
				expect(result.reason).not.toContain(cause.message);
			}
			expect(consoleError).toHaveBeenCalledWith(
				"[app-shell] Failed to load deferred chrome part 'organization-switcher':",
				cause
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
