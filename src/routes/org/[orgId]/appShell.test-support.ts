import { vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { AppShellRouteData, ReadyAppShell } from '$features/app-shell/contracts';

export function createReadyAppShellRouteData(
	overrides: {
		orgId?: string;
		orgUrlSegment?: string;
		orgName?: string;
		userId?: string;
		role?: ReadyAppShell['member']['role'];
		criticalTasksCapability?: ReadyAppShell['member']['capabilityMap']['criticalTasks'];
	} = {}
): AppShellRouteData {
	const role = overrides.role ?? 'admin';
	const member: ReadyAppShell['member'] = {
		membershipId: 'membership-1',
		role,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: overrides.criticalTasksCapability ?? 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		isOwner: role === 'owner',
		isAdmin: role === 'admin'
	};

	return {
		shell: {
			kind: 'ready',
			org: {
				id: overrides.orgId ?? 'org-1',
				urlSegment: overrides.orgUrlSegment ?? overrides.orgId ?? 'org-1',
				name: overrides.orgName ?? 'Test Org'
			},
			user: { id: overrides.userId ?? 'user-1' },
			member,
			state: { orgSuspended: false },
			preferences: {
				calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
				training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' }
			},
			announcements: []
		}
	};
}

export function createSuspendedAppShellRouteData(
	overrides: { orgId?: string; orgUrlSegment?: string; orgName?: string } = {}
): AppShellRouteData {
	return {
		shell: {
			kind: 'suspended',
			org: {
				id: overrides.orgId ?? 'org-1',
				urlSegment: overrides.orgUrlSegment ?? overrides.orgId ?? 'org-1',
				name: overrides.orgName ?? 'Test Org'
			},
			state: { orgSuspended: true }
		}
	};
}

export function createUrlBlindLayoutEvent<TEvent>(parentData: AppShellRouteData) {
	const depends = vi.fn();
	const event = {
		locals: {} as App.Locals,
		cookies: {} as Cookies,
		depends,
		parent: vi.fn(async () => parentData),
		get url(): URL {
			throw new Error('Feature workspace layouts must not read the URL');
		}
	} as unknown as TEvent;
	return { event, depends };
}
