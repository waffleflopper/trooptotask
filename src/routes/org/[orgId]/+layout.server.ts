import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { OrganizationMemberPermissions } from '$lib/types';
import { loadRootOrgShellRouteData } from '$lib/server/core/useCases/loadRootOrgShell';
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
			chrome: { unreadNotificationCount: 0, activeAnnouncements: [], allOrgs: [] }
		})
	);
}

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:org-core');

	const user = locals.user;
	const { orgId } = params;

	// Check for demo mode
	const demoMode = cookies.get('demo_mode');
	const demoSandboxCookie = cookies.get('demo_sandbox');
	const isDemoReadOnly = demoMode === 'readonly';

	// Get appropriate supabase client via adapter (service role for demo mode)
	const { supabase } = getLayoutClient(locals, cookies, orgId);

	// Get organization info (including demo_type and suspended_at)
	const { data: org } = await supabase
		.from('organizations')
		.select('id, name, demo_type, suspended_at')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	// Check org suspension
	if (org.suspended_at) {
		return {
			orgSuspended: true,
			orgId,
			orgName: org.name
		};
	}

	// Deprecated demo showcase path retained temporarily during demo cleanup.
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

		const effectiveTier = await createSupabaseSubscriptionAdapter(supabase, orgId).getEffectiveTier();

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

	// Deprecated demo sandbox path retained temporarily during demo cleanup.
	// This flow is already unavailable in production and should not gain new behavior.
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

				const effectiveTier = await createSupabaseSubscriptionAdapter(supabase, orgId).getEffectiveTier();

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

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	const subscriptionAdapter = createSupabaseSubscriptionAdapter(supabase, orgId);
	const effectiveTierPromise = subscriptionAdapter.getEffectiveTier();

	return loadRootOrgShellRouteData(
		createSupabaseOrgAccessPort({
			orgId,
			userId: user.id,
			userSupabase: locals.supabase,
			orgName: org.name,
			isDemoReadOnly: false,
			isDemoSandbox: false,
			getEffectiveTier: () => effectiveTierPromise
		}),
		createSupabaseOrgChromePort({
			orgId,
			userId: user.id,
			userSupabase: locals.supabase,
			supabase
		})
	);
};
