import { describe, expect, it } from 'vitest';
import {
	createInMemoryAppShellDeferredChromePort,
	createInMemoryAppShellFirstPaintChromePort,
	createInMemoryOrgAccessPort
} from '$lib/server/adapters/inMemoryOrgShell';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import type { MembershipInfo, OrgState } from '../orgShell';
import { loadAppShellDeferredChrome, loadAppShellFirstPaint } from './loadAppShell';

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
	scopeSet: { kind: 'organization' },
	permissions: {
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewCriticalTasks: true,
		canEditCriticalTasks: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canManageMembers: false
	}
};

const orgState: OrgState = {
	orgName: 'Test Unit',
	effectiveTier: {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 20,
		isReadOnly: false,
		readOnlyReason: null,
		giftExpiresAt: null,
		giftTier: null
	}
};

describe('loadAppShellFirstPaint', () => {
	it('returns only the shell envelope for the ready path', async () => {
		const result = await loadAppShellFirstPaint({
			kind: 'ready',
			orgUrlSegment: 'test-unit',
			access: createInMemoryOrgAccessPort({ membership, orgState }),
			chrome: createInMemoryAppShellFirstPaintChromePort({
				chrome: {
					announcements: [{ id: 'a1', title: 'Heads up', message: 'Read this', type: 'info' }],
					preferences: getDefaultUserOrgPreferences()
				}
			})
		});

		expect(result).toEqual({
			shell: expect.objectContaining({
				kind: 'ready',
				org: { id: 'org-1', name: 'Test Unit', urlSegment: 'test-unit' },
				user: { id: 'user-1' },
				member: expect.objectContaining({
					membershipId: 'membership-1',
					role: 'member',
					permissions: membership.permissions
				}),
				state: expect.objectContaining({
					effectiveTier: orgState.effectiveTier,
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
				state: { isReadOnly: true, orgSuspended: true }
			}
		});
		expect(result).not.toHaveProperty('orgSuspended');
	});
});

describe('loadAppShellDeferredChrome', () => {
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
});
