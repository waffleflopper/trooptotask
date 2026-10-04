import type { Announcement } from '$features/notifications/contracts';
import {
	createSupabaseNotificationStore,
	createSupabaseAccountAnnouncementDismissals
} from '$features/notifications/index.server';
import { listActiveAnnouncementContent } from '$features/platform-admin/index.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import type { MembershipRow } from '$lib/server/permissionContext';
import { getDefaultUserOrgPreferences } from '$features/identity/contracts';
import { loadUserOrgPreferences } from '$features/identity/index.server';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	OrgAccessPort,
	MembershipInfo,
	OrgState,
	OrganizationSwitcherOrg
} from './contracts';
import {
	readOrganizationMembershipAccess,
	readOrganizationMembershipSummaries
} from '$features/organization/index.server';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export function createSupabaseOrgAccessPort(config: {
	orgId: string;
	userId: string;
	/** User-scoped Supabase client (from `locals.supabase`) for membership queries. */
	userSupabase: SupabaseClient;
	/** Pre-fetched org name (org row is already loaded before membership in the layout). */
	orgName: string;
	wrapMembershipLoad?: (loadMembershipRow: () => Promise<MembershipRow>) => Promise<MembershipRow>;
}): OrgAccessPort {
	return {
		async getMembership(): Promise<MembershipInfo> {
			const membership = await (config.wrapMembershipLoad?.(() =>
				readOrganizationMembershipAccess(config.userSupabase, config.userId, config.orgId)
			) ?? readOrganizationMembershipAccess(config.userSupabase, config.userId, config.orgId));
			const access = projectEffectiveMemberAccess(membership);

			return {
				orgId: config.orgId,
				membershipId: membership.id ?? null,
				userId: config.userId,
				role: membership.role,
				capabilityMap: access.capabilityMap,
				scopeSet: access.scopeSet,
				// orgSuspended is checked and short-circuits before this adapter is ever
				// instantiated, so we only reach getMembership() for non-suspended orgs.
				orgSuspended: false
			};
		},

		async getOrgState(): Promise<OrgState> {
			return {
				orgName: config.orgName
			};
		}
	};
}

export function createSupabaseAppShellFirstPaintChromePort(config: {
	orgId: string;
	userId: string;
	/** User-scoped Supabase client for dismissals and preferences. */
	userSupabase: SupabaseClient;
	/** Admitted request-user client for platform announcement content. */
	supabase: SupabaseClient;
}): AppShellFirstPaintChromePort {
	return {
		async getFirstPaintChrome(): Promise<AppShellFirstPaintChrome> {
			const [announcements, preferences] = await Promise.all([
				loadActiveAnnouncements({
					userId: config.userId,
					userSupabase: config.userSupabase,
					supabase: config.supabase
				}),
				loadFirstPaintPreferences(config)
			]);

			return { announcements, preferences };
		}
	};
}

export function createSupabaseAppShellDeferredChromePort(config: {
	orgId: string;
	userId: string;
	/** User-scoped Supabase client for notifications and organization switcher data. */
	userSupabase: SupabaseClient;
}): AppShellDeferredChromePort {
	return {
		getUnreadNotificationCount(): Promise<number> {
			return createSupabaseNotificationStore(config.userSupabase).countOwnUnread(config.orgId, config.userId);
		},

		getOrganizationSwitcherOrgs(): Promise<OrganizationSwitcherOrg[]> {
			return loadOrganizationSwitcherOrgs({
				userId: config.userId,
				userSupabase: config.userSupabase
			});
		}
	};
}

async function loadActiveAnnouncements(config: {
	userId: string;
	userSupabase: SupabaseClient;
	supabase: SupabaseClient;
}): Promise<Announcement[]> {
	try {
		const [announcements, dismissedIds] = await Promise.all([
			listActiveAnnouncementContent(config.supabase),
			createSupabaseAccountAnnouncementDismissals(config.userSupabase, config.userId).listDismissedIds()
		]);
		const dismissed = new Set(dismissedIds);
		return announcements.filter(({ id }) => !dismissed.has(id));
	} catch (cause) {
		console.error('[app-shell] Failed to load first-paint announcements:', cause);
		return [];
	}
}

async function loadFirstPaintPreferences(config: { orgId: string; userId: string; userSupabase: SupabaseClient }) {
	try {
		return await loadUserOrgPreferences({ supabase: config.userSupabase }, config);
	} catch (cause) {
		console.error('[app-shell] Failed to load user preferences:', sanitizeErrorForLog(cause));
		return getDefaultUserOrgPreferences();
	}
}

async function loadOrganizationSwitcherOrgs(config: {
	userId: string;
	userSupabase: SupabaseClient;
}): Promise<OrganizationSwitcherOrg[]> {
	const membershipsRes = await readOrganizationMembershipSummaries(config.userSupabase, config.userId);

	if (membershipsRes.error) {
		throw new Error(
			`Failed to load organization memberships: ${(membershipsRes.error as { message?: string }).message ?? 'Unknown error'}`
		);
	}

	return membershipsRes.data ?? [];
}
