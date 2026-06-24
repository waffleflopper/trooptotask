import { describe, it, expect } from 'vitest';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { createReadyAppShell } from './orgShell';
import type { AppShellFirstPaintChrome, MembershipInfo, OrgState } from './orgShell';

const viewerCapabilityMap: MembershipInfo['capabilityMap'] = {
	calendar: 'view',
	personnel: 'view',
	training: 'view',
	criticalTasks: 'view',
	onboarding: 'none',
	ratingScheme: 'none'
};

const baseMembership: MembershipInfo = {
	orgId: 'org-1',
	membershipId: 'membership-1',
	userId: 'user-1',
	role: 'member',
	capabilityMap: viewerCapabilityMap,
	scopeSet: { kind: 'organization' }
};

const baseOrgState: OrgState = {
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

const baseFirstPaintChrome: AppShellFirstPaintChrome = {
	announcements: [],
	preferences: getDefaultUserOrgPreferences()
};

describe('createReadyAppShell', () => {
	it('preserves the authenticated membership user id', () => {
		const shell = createReadyAppShell({
			orgUrlSegment: 'test-unit',
			membership: baseMembership,
			orgState: baseOrgState,
			firstPaintChrome: baseFirstPaintChrome
		});

		expect(shell.user.id).toBe('user-1');
	});
});
