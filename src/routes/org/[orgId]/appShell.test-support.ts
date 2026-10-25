import { vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Cookies } from '@sveltejs/kit';
import type { AppShellRouteData, ReadyAppShell } from '$features/app-shell/contracts';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { SignedInAccount } from '$features/identity/contracts';

export function createReadyAppShellRouteData(
	overrides: {
		orgId?: string;
		orgUrlSegment?: string;
		orgName?: string;
		userId?: string;
		account?: SignedInAccount;
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
				name: overrides.orgName ?? 'Test Org',
				disabledFeatures: []
			},
			user: {
				id: overrides.userId ?? 'user-1',
				...(overrides.account ?? {
					email: 'user-1@example.test',
					hasTwoFactor: true,
					profile: { status: 'loaded', profile: null }
				})
			},
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

export function createOrganizationLoadEventData(
	parentData: AppShellRouteData,
	{ disabledFeatures }: { disabledFeatures?: FeatureKey[] } = {}
) {
	const shell = parentData.shell;
	const orgId = shell.org.id;
	const switches = disabledFeatures ?? (shell.kind === 'ready' ? shell.org.disabledFeatures : []);
	const supabase = createClient('http://organization.invalid', 'synthetic-request-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async () =>
				Response.json({
					id: orgId,
					name: shell.org.name,
					url_slug: shell.org.urlSegment !== orgId ? shell.org.urlSegment : null,
					suspended_at: shell.kind === 'suspended' ? '2026-01-01T00:00:00Z' : null,
					disabled_features: switches
				})
		}
	});
	const membership = shell.kind === 'ready' ? shell.member : null;
	const userId = shell.kind === 'ready' ? shell.user.id : 'user-1';
	return {
		locals: {
			supabase,
			actor: { userId },
			session: null,
			membershipContextCache: new Map([
				[
					`${userId}:${orgId}`,
					Promise.resolve({
						id: membership?.membershipId ?? 'membership-1',
						role: membership?.role ?? 'member',
						member_preset: 'viewer',
						capability_overrides: membership?.capabilityMap ?? {},
						access_scope_kind: membership?.scopeSet.kind ?? 'organization',
						access_scope_group_ids: membership?.scopeSet.kind === 'groups' ? membership.scopeSet.groupIds : []
					})
				]
			])
		} as unknown as App.Locals,
		params: { orgId },
		parent: () => {
			throw new Error('Feature loads must not run ancestor loads');
		}
	};
}

export function createUrlBlindLayoutEvent<TEvent>(
	parentData: AppShellRouteData,
	options: { disabledFeatures?: FeatureKey[] } = {}
) {
	const depends = vi.fn();
	const event = {
		...createOrganizationLoadEventData(parentData, options),
		cookies: {} as Cookies,
		depends,
		get url(): URL {
			throw new Error('Feature workspace layouts must not read the URL');
		}
	} as unknown as TEvent;
	return { event, depends };
}
