/**
 * Supabase-backed implementations of `OrgAccessPort` and `OrgChromePort` for the org shell split
 * (RFC #415). These are the production adapters; in-memory equivalents for tests live in
 * `inMemoryOrgShell.ts`.
 *
 * Both factories are pre-configured at construction time (orgId, userId, supabase clients) and
 * issue no DB queries until their port methods are called.
 */
import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { EffectiveTier } from '$lib/types/subscription';
import type {
	OrgAccessPort,
	OrgChromePort,
	MembershipInfo,
	OrgState,
	ChromeData,
	Announcement
} from '../core/orgShell';

export function createSupabaseOrgAccessPort(config: {
	orgId: string;
	userId: string;
	/** User-scoped Supabase client (from `locals.supabase`) for membership queries. */
	userSupabase: SupabaseClient;
	/** Pre-fetched org name (org row is already loaded before membership in the layout). */
	orgName: string;
	isDemoReadOnly: boolean;
	isDemoSandbox: boolean;
	/** Delegate to the existing subscription adapter — avoids re-instantiating it. */
	getEffectiveTier: () => Promise<EffectiveTier>;
}): OrgAccessPort {
	return {
		async getMembership(): Promise<MembershipInfo> {
			const { data } = await config.userSupabase
				.from('organization_memberships')
				.select(
					'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
				)
				.eq('user_id', config.userId)
				.eq('organization_id', config.orgId)
				.single();

			if (!data) throw error(403, 'You are not a member of this organization');

			const isOwner = data.role === 'owner';
			const isAdmin = data.role === 'admin';
			const isPrivileged = isOwner || isAdmin;

			const permissions: OrganizationMemberPermissions = {
				canViewCalendar: isPrivileged || data.can_view_calendar,
				canEditCalendar: isPrivileged || data.can_edit_calendar,
				canViewPersonnel: isPrivileged || data.can_view_personnel,
				canEditPersonnel: isPrivileged || data.can_edit_personnel,
				canViewTraining: isPrivileged || data.can_view_training,
				canEditTraining: isPrivileged || data.can_edit_training,
				canViewOnboarding: isPrivileged || data.can_view_onboarding,
				canEditOnboarding: isPrivileged || data.can_edit_onboarding,
				canViewLeadersBook: isPrivileged || data.can_view_leaders_book,
				canEditLeadersBook: isPrivileged || data.can_edit_leaders_book,
				canManageMembers: isPrivileged || data.can_manage_members
			};

			return {
				orgId: config.orgId,
				userId: config.userId,
				role: data.role as 'owner' | 'admin' | 'member',
				permissions,
				scopedGroupId: isPrivileged ? null : (data.scoped_group_id ?? null),
				// orgSuspended is checked and short-circuits before this adapter is ever
				// instantiated, so we only reach getMembership() for non-suspended orgs.
				orgSuspended: false
			};
		},

		async getOrgState(): Promise<OrgState> {
			const effectiveTier = await config.getEffectiveTier();
			return {
				orgName: config.orgName,
				isDemoReadOnly: config.isDemoReadOnly,
				isDemoSandbox: config.isDemoSandbox,
				effectiveTier
			};
		}
	};
}

export function createSupabaseOrgChromePort(config: {
	orgId: string;
	userId: string;
	/** User-scoped Supabase client for notifications, memberships, and dismissals. */
	userSupabase: SupabaseClient;
	/** Service-role or anon client for platform announcements. */
	supabase: SupabaseClient;
}): OrgChromePort {
	return {
		async getChromeData(): Promise<ChromeData> {
			const [membershipsRes, notifRes, announcementsRes, dismissalsRes] = await Promise.all([
				config.userSupabase
					.from('organization_memberships')
					.select('role, organizations(id, name)')
					.eq('user_id', config.userId),
				config.userSupabase
					.from('notifications')
					.select('id', { count: 'exact', head: true })
					.eq('user_id', config.userId)
					.eq('organization_id', config.orgId)
					.eq('read', false),
				config.supabase
					.from('platform_announcements')
					.select('id, title, message, type')
					.eq('is_active', true)
					.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
				config.userSupabase
					.from('announcement_dismissals')
					.select('announcement_id')
					.eq('user_id', config.userId)
			]);

			const allOrgs = (membershipsRes.data ?? [])
				.filter((m: Record<string, unknown>) => m.organizations)
				.map((m: Record<string, unknown>) => {
					const org = m.organizations as Record<string, unknown>;
					return { id: org.id as string, name: org.name as string, role: m.role as string };
				});

			const dismissedIds = new Set(
				(dismissalsRes.data ?? []).map((d: Record<string, unknown>) => d.announcement_id)
			);
			const activeAnnouncements: Announcement[] = (announcementsRes.data ?? [])
				.filter((a: Record<string, unknown>) => !dismissedIds.has(a.id))
				.map((a: Record<string, unknown>) => ({
					id: a.id as string,
					title: a.title as string,
					message: a.message as string,
					type: a.type as 'info' | 'warning' | 'critical'
				}));

			return {
				unreadNotificationCount: notifRes.count ?? 0,
				activeAnnouncements,
				allOrgs
			};
		}
	};
}
