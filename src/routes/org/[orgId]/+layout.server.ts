import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isFullEditor, type OrganizationMemberPermissions } from '$lib/types';
import { fetchSharedData } from '$lib/server/core/useCases/sharedDataQuery';
import {
	buildLayoutContext,
	buildLayoutContextFromMembership,
	getLayoutClient
} from '$lib/server/adapters/httpAdapter';
import type { MembershipRow } from '$lib/server/permissionContext';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';

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

		const [shared, effectiveTier] = await Promise.all([
			fetchSharedData(demoCtx),
			demoCtx.subscription.getEffectiveTier()
		]);

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
			...shared
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
				const [shared, effectiveTier] = await Promise.all([
					fetchSharedData(sandboxCtx),
					sandboxCtx.subscription.getEffectiveTier()
				]);

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
					...shared
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Parallelize: membership + allOrgs (single query), tier, and announcements
	// Note: fetchSharedData is called after membership resolves (needs scopedGroupId)
	const subscriptionAdapter = createSupabaseSubscriptionAdapter(supabase, orgId);
	const [membershipsRes, effectiveTier, notificationCountRes, announcementsRes, dismissalsRes] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'organization_id, role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id, organizations(id, name)'
			)
			.eq('user_id', user.id),
		subscriptionAdapter.getEffectiveTier(),
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
	const shared = await fetchSharedData(ctx);

	// Filter out dismissed announcements
	const dismissedIds = new Set((dismissalsRes.data ?? []).map((d: Record<string, unknown>) => d.announcement_id));
	const activeAnnouncements = (announcementsRes.data ?? []).filter(
		(a: Record<string, unknown>) => !dismissedIds.has(a.id)
	);

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
		...shared
	};
};
