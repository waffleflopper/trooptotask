import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isFullEditor, type OrganizationMemberPermissions } from '$lib/types';
import { loadOrgShell } from '$lib/server/core/useCases/loadOrgShell';
import {
	buildLayoutContext,
	buildLayoutContextFromMembership,
	getLayoutClient
} from '$lib/server/adapters/httpAdapter';
import type { MembershipRow } from '$lib/server/permissionContext';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { createSupabaseOrgAccessPort, createSupabaseOrgChromePort } from '$lib/server/adapters/supabaseOrgShell';
import { createInMemoryOrgAccessPort, createInMemoryOrgChromePort } from '$lib/server/adapters/inMemoryOrgShell';

async function buildDemoShell(config: {
	orgId: string;
	orgName: string;
	permissions: OrganizationMemberPermissions;
	role: 'owner' | 'admin' | 'member';
	isDemoReadOnly: boolean;
	isDemoSandbox: boolean;
	effectiveTier: Awaited<ReturnType<ReturnType<typeof createSupabaseSubscriptionAdapter>['getEffectiveTier']>>;
}) {
	return loadOrgShell(
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

	// Handle demo showcase access (no login required for read-only viewing)
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

		const demoStore = createSupabaseDataStore(supabase);
		const demoCtx = {
			store: demoStore,
			rawStore: demoStore,
			auth: {
				userId: null,
				orgId,
				role: 'member' as const,
				isPrivileged: false,
				isFullEditor: false,
				scopedGroupId: null,
				requireEdit() {},
				requireView() {},
				requirePrivileged() {},
				requireOwner() {},
				requireFullEditor() {},
				requireManageMembers() {},
				async requireGroupAccess() {},
				async requireGroupAccessBatch() {},
				async requireGroupAccessByRecord() {}
			},
			audit: { log() {} },
			readOnlyGuard: {
				async check() {
					return false;
				}
			},
			subscription: createSupabaseSubscriptionAdapter(supabase, orgId),
			notifications: {
				async notifyUser() {},
				async notifyAdmins() {}
			},
			billing: {
				async createCheckoutSession() {
					return { url: '', customerId: '' };
				},
				async createPortalSession() {
					return { url: '' };
				},
				async cancelSubscription() {},
				async pauseSubscription() {},
				async resumeSubscription() {}
			},
			storage: {
				async upload() {},
				async remove() {},
				async createSignedUrl() {
					return '';
				}
			}
		};

		const effectiveTier = await demoCtx.subscription.getEffectiveTier();

		const shell = await buildDemoShell({
			orgId,
			orgName: org.name,
			permissions: readOnlyPermissions,
			role: 'member',
			isDemoReadOnly: true,
			isDemoSandbox: false,
			effectiveTier
		});

		return {
			orgId,
			orgName: org.name,
			userRole: 'member' as const,
			userId: null,
			permissions: readOnlyPermissions,
			isFullEditor: false,
			unreadNotificationCount: 0,
			scopedGroupId: null,
			isOwner: false,
			isAdmin: false,
			allOrgs: [],
			effectiveTier,
			isDemoReadOnly: true,
			isDemoSandbox: false,
			shell
		};
	}

	// Handle demo sandbox access (no login required, full access to sandbox)
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

				const sandboxCtx = await buildLayoutContext(locals, cookies, orgId);
				const effectiveTier = await sandboxCtx.subscription.getEffectiveTier();

				const shell = await buildDemoShell({
					orgId,
					orgName: org.name,
					permissions: fullPermissions,
					role: 'owner',
					isDemoReadOnly: false,
					isDemoSandbox: true,
					effectiveTier
				});

				return {
					orgId,
					orgName: org.name,
					userRole: 'owner' as const,
					userId: null,
					permissions: fullPermissions,
					isFullEditor: true,
					unreadNotificationCount: 0,
					scopedGroupId: null,
					isOwner: true,
					isAdmin: false,
					allOrgs: [],
					effectiveTier,
					isDemoReadOnly: false,
					isDemoSandbox: true,
					shell
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Parallelize: membership + allOrgs (single query), tier, and announcements.
	// Shell loading starts concurrently — adapters issue their own queries in parallel
	// with the existing pipeline. Some query overlap is expected during migration.
	const subscriptionAdapter = createSupabaseSubscriptionAdapter(supabase, orgId);

	// Share the tier promise so both the shell and the existing path resolve it once.
	const effectiveTierPromise = subscriptionAdapter.getEffectiveTier();

	const [membershipsRes, effectiveTier, notificationCountRes, announcementsRes, dismissalsRes] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'organization_id, role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id, organizations(id, name)'
			)
			.eq('user_id', user.id),
		effectiveTierPromise,
		locals.supabase
			.from('notifications')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', user.id)
			.eq('organization_id', orgId)
			.eq('read', false),
		supabase
			.from('platform_announcements')
			.select('id, title, message, type')
			.eq('is_active', true)
			.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
		locals.supabase.from('announcement_dismissals').select('announcement_id').eq('user_id', user.id)
	]);

	const allMemberships = membershipsRes.data ?? [];
	const membership = allMemberships.find((m: Record<string, unknown>) => m.organization_id === orgId);
	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	// Start shell loading after membership check so a 403 doesn't leave shellPromise as an unhandled rejection.
	const shellPromise = loadOrgShell(
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

	const allOrgs = allMemberships
		.filter((m: Record<string, unknown>) => m.organizations)
		.map((m: Record<string, unknown>) => {
			const org = m.organizations as Record<string, unknown>;
			return { id: org.id as string, name: org.name as string, role: m.role as string };
		});

	const isOwner = membership.role === 'owner';
	const isAdmin = membership.role === 'admin';
	const isPrivileged = isOwner || isAdmin;

	// Build permissions object - owners and admins always have full access
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isPrivileged || membership.can_view_calendar,
		canEditCalendar: isPrivileged || membership.can_edit_calendar,
		canViewPersonnel: isPrivileged || membership.can_view_personnel,
		canEditPersonnel: isPrivileged || membership.can_edit_personnel,
		canViewTraining: isPrivileged || membership.can_view_training,
		canEditTraining: isPrivileged || membership.can_edit_training,
		canViewOnboarding: isPrivileged || membership.can_view_onboarding,
		canEditOnboarding: isPrivileged || membership.can_edit_onboarding,
		canViewLeadersBook: isPrivileged || membership.can_view_leaders_book,
		canEditLeadersBook: isPrivileged || membership.can_edit_leaders_book,
		canManageMembers: isPrivileged || membership.can_manage_members
	};

	const scopedGroupId: string | null = isPrivileged ? null : (membership.scoped_group_id ?? null);

	const fullEditor = !isPrivileged && !scopedGroupId && isFullEditor(permissions);

	const ctx = await buildLayoutContextFromMembership(locals, cookies, orgId, membership as MembershipRow);

	// Filter out dismissed announcements
	const dismissedIds = new Set((dismissalsRes.data ?? []).map((d: Record<string, unknown>) => d.announcement_id));
	const activeAnnouncements = (announcementsRes.data ?? []).filter(
		(a: Record<string, unknown>) => !dismissedIds.has(a.id)
	);

	const shell = await shellPromise;

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'admin' | 'member',
		userId: user.id,
		permissions,
		isFullEditor: fullEditor,
		unreadNotificationCount: notificationCountRes.count ?? 0,
		scopedGroupId,
		isOwner,
		isAdmin,
		allOrgs,
		effectiveTier,
		isDemoReadOnly: false,
		isDemoSandbox: false,
		activeAnnouncements,
		shell
	};
};
