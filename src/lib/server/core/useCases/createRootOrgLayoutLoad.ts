import { error, redirect } from '@sveltejs/kit';
import type { OrganizationMemberPermissions } from '$lib/types';
import { getDefaultUserOrgPreferences } from '$lib/preferences/userPreferences';
import { createOrgShellCoordinator, type OrgShellCoordinator } from '../orgShellCoordinator';
import { loadRootOrgShellRouteData } from './loadRootOrgShell';
import { getLayoutClient } from '$lib/server/adapters/httpAdapter';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { createSupabaseOrgAccessPort, createSupabaseOrgChromePort } from '$lib/server/adapters/supabaseOrgShell';
import { createInMemoryOrgAccessPort, createInMemoryOrgChromePort } from '$lib/server/adapters/inMemoryOrgShell';

/**
 * Deprecated demo-only shell path kept temporarily while demo sandbox access is phased out.
 * Do not expand this path; prefer removal when demo sandbox cleanup work is scheduled.
 */
async function loadDemoRootOrgShellRouteData(config: {
	orgId: string;
	orgName: string;
	permissions: OrganizationMemberPermissions;
	role: 'owner' | 'admin' | 'member';
	isDemoReadOnly: boolean;
	isDemoSandbox: boolean;
	effectiveTier: Awaited<ReturnType<ReturnType<typeof createSupabaseSubscriptionAdapter>['getEffectiveTier']>>;
}) {
	return loadRootOrgShellRouteData(
		createInMemoryOrgAccessPort({
			membership: {
				orgId: config.orgId,
				userId: null,
				role: config.role,
				permissions: config.permissions,
				scopedGroupId: null
			},
			orgState: {
				orgName: config.orgName,
				isDemoReadOnly: config.isDemoReadOnly,
				isDemoSandbox: config.isDemoSandbox,
				effectiveTier: config.effectiveTier
			}
		}),
		createInMemoryOrgChromePort({
			chrome: {
				unreadNotificationCount: 0,
				activeAnnouncements: [],
				allOrgs: [],
				userPreferences: getDefaultUserOrgPreferences()
			}
		})
	);
}

export interface RootOrgLayoutLoadDeps {
	coordinator?: OrgShellCoordinator;
	getLayoutClient?: typeof getLayoutClient;
	createSubscriptionAdapter?: typeof createSupabaseSubscriptionAdapter;
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createOrgChromePort?: typeof createSupabaseOrgChromePort;
}

export function createRootOrgLayoutLoad(deps: RootOrgLayoutLoadDeps = {}) {
	const coordinator = deps.coordinator ?? createOrgShellCoordinator();
	const getLayoutClientFn = deps.getLayoutClient ?? getLayoutClient;
	const createSubscriptionAdapterFn = deps.createSubscriptionAdapter ?? createSupabaseSubscriptionAdapter;
	const createOrgAccessPortFn = deps.createOrgAccessPort ?? createSupabaseOrgAccessPort;
	const createOrgChromePortFn = deps.createOrgChromePort ?? createSupabaseOrgChromePort;

	return async ({
		params,
		locals,
		cookies,
		depends
	}: {
		params: { orgId: string };
		locals: App.Locals;
		cookies: import('@sveltejs/kit').Cookies;
		depends: (...deps: string[]) => void;
	}) => {
		depends('app:org-core', 'app:org-preferences');

		const user = locals.user;
		const { orgId } = params;

		const demoMode = cookies.get('demo_mode');
		const demoSandboxCookie = cookies.get('demo_sandbox');
		const isDemoReadOnly = demoMode === 'readonly';

		const { supabase } = getLayoutClientFn(locals, cookies, orgId);

		const { data: org } = await supabase
			.from('organizations')
			.select('id, name, demo_type, suspended_at')
			.eq('id', orgId)
			.single();

		if (!org) {
			throw error(404, 'Organization not found');
		}

		if (org.suspended_at) {
			return {
				orgSuspended: true,
				orgId,
				orgName: org.name
			};
		}

		if (org.demo_type === 'showcase' && isDemoReadOnly) {
			const readOnlyPermissions: OrganizationMemberPermissions = {
				canViewCalendar: true,
				canEditCalendar: false,
				canViewPersonnel: true,
				canEditPersonnel: false,
				canViewTraining: true,
				canEditTraining: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canViewLeadersBook: true,
				canEditLeadersBook: false,
				canManageMembers: false
			};

			const effectiveTier = await createSubscriptionAdapterFn(supabase, orgId).getEffectiveTier();

			return loadDemoRootOrgShellRouteData({
				orgId,
				orgName: org.name,
				permissions: readOnlyPermissions,
				role: 'member',
				isDemoReadOnly: true,
				isDemoSandbox: false,
				effectiveTier
			});
		}

		if (org.demo_type === 'sandbox' && demoSandboxCookie) {
			try {
				const sandboxInfo = JSON.parse(demoSandboxCookie);
				if (sandboxInfo.orgId === orgId) {
					const fullPermissions: OrganizationMemberPermissions = {
						canViewCalendar: true,
						canEditCalendar: true,
						canViewPersonnel: true,
						canEditPersonnel: true,
						canViewTraining: true,
						canEditTraining: true,
						canViewOnboarding: true,
						canEditOnboarding: true,
						canViewLeadersBook: true,
						canEditLeadersBook: true,
						canManageMembers: true
					};

					const effectiveTier = await createSubscriptionAdapterFn(supabase, orgId).getEffectiveTier();

					return loadDemoRootOrgShellRouteData({
						orgId,
						orgName: org.name,
						permissions: fullPermissions,
						role: 'owner',
						isDemoReadOnly: false,
						isDemoSandbox: true,
						effectiveTier
					});
				}
			} catch {
				// Invalid cookie, ignore
			}
		}

		if (!user) throw redirect(303, '/auth/login');

		const subscriptionAdapter = createSubscriptionAdapterFn(supabase, orgId);
		const effectiveTierPromise = subscriptionAdapter.getEffectiveTier();

		return coordinator.loadRoot({
			access: createOrgAccessPortFn({
				orgId,
				userId: user.id,
				userSupabase: locals.supabase,
				orgName: org.name,
				isDemoReadOnly: false,
				isDemoSandbox: false,
				getEffectiveTier: () => effectiveTierPromise
			}),
			chrome: createOrgChromePortFn({
				orgId,
				userId: user.id,
				userSupabase: locals.supabase,
				supabase
			})
		});
	};
}
