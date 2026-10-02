import type { Announcement } from '$features/notifications/contracts';
import {
	createSupabaseNotificationStore,
	createSupabaseAccountAnnouncementDismissals
} from '$features/notifications/index.server';
import { listActiveAnnouncementContent } from '$features/platform-admin/index.server';
/**
 * Supabase-backed implementations of App Shell ports for the org shell split
 * (RFC #415). These are the production adapters; in-memory equivalents for tests live in
 * `inMemoryOrgShell.ts`.
 *
 * Both factories are pre-configured at construction time (orgId, userId, supabase clients) and
 * issue no DB queries until their port methods are called.
 */
import { error, redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { projectEffectiveMemberAccess } from '$lib/access/memberAccessProjection';
import { assertNormalizedMembershipRow, type MembershipRow } from '$lib/server/permissionContext';
import { getDefaultUserOrgPreferences, normalizeUserOrgPreferences } from '$lib/preferences/userPreferences';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	AppShellRequest,
	OrgAccessPort,
	MembershipInfo,
	OrgState,
	OrganizationSwitcherOrg
} from '../core/orgShell';
import {
	loadAppShellDeferredChrome,
	loadAppShellFirstPaint,
	type AppShellFirstPaintRequest
} from '../core/useCases/loadAppShell';
import { getLayoutClient } from './httpAdapter';
import { getOrLoadRequestMembership } from '$lib/server/membershipContextCache';
import {
	resolveOrganizationRouteIdentity,
	readOrganizationMembershipSummaries
} from '$features/organization/index.server';
import { getPreferredOrganizationUrlSegment } from '$features/organization/contracts';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

export interface SupabaseAppShellRequestDeps {
	getLayoutClient?: typeof getLayoutClient;
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createFirstPaintChromePort?: typeof createSupabaseAppShellFirstPaintChromePort;
	createDeferredChromePort?: typeof createSupabaseAppShellDeferredChromePort;
}

export function createSupabaseAppShellRequest(
	config: {
		locals: App.Locals;
		cookies: Cookies;
		orgSegment: string;
		url?: URL;
	},
	deps: SupabaseAppShellRequestDeps = {}
): AppShellRequest {
	const getLayoutClientFn = deps.getLayoutClient ?? getLayoutClient;
	const createOrgAccessPortFn = deps.createOrgAccessPort ?? createSupabaseOrgAccessPort;
	const createFirstPaintChromePortFn = deps.createFirstPaintChromePort ?? createSupabaseAppShellFirstPaintChromePort;
	const createDeferredChromePortFn = deps.createDeferredChromePort ?? createSupabaseAppShellDeferredChromePort;

	async function resolveOrgRoute() {
		const { supabase } = getLayoutClientFn(config.locals, config.cookies, config.orgSegment);
		const org = await resolveOrganizationRouteIdentity(supabase, config.orgSegment);

		if (!org) {
			throw error(404, 'Organization not found');
		}

		const orgUrlSegment = getPreferredOrganizationUrlSegment({ id: org.id, urlSlug: org.urlSlug });

		if (config.url && org.urlSlug && config.orgSegment !== org.urlSlug) {
			const currentBase = `/org/${config.orgSegment}`;
			const canonicalBase = `/org/${org.urlSlug}`;
			const pathname = config.url.pathname.startsWith(currentBase)
				? `${canonicalBase}${config.url.pathname.slice(currentBase.length)}`
				: canonicalBase;
			throw redirect(308, `${pathname}${config.url.search}`);
		}

		return { supabase, org, orgUrlSegment };
	}

	async function resolveFirstPaintRequest(): Promise<AppShellFirstPaintRequest> {
		const { supabase, org, orgUrlSegment } = await resolveOrgRoute();

		if (org.suspendedAt) {
			return {
				kind: 'suspended',
				orgId: org.id,
				orgName: org.name ?? 'Organization',
				orgUrlSegment
			};
		}

		if (!config.locals.actor) {
			throw redirect(303, '/auth/login');
		}

		const actor = config.locals.actor;

		return {
			kind: 'ready',
			orgUrlSegment,
			access: createOrgAccessPortFn({
				orgId: org.id,
				userId: actor.userId,
				userSupabase: config.locals.supabase,
				orgName: org.name ?? 'Organization',
				wrapMembershipLoad: (loadMembershipRow) =>
					getOrLoadRequestMembership(config.locals, actor.userId, org.id, loadMembershipRow)
			}),
			chrome: createFirstPaintChromePortFn({
				orgId: org.id,
				userId: actor.userId,
				userSupabase: config.locals.supabase,
				supabase
			})
		};
	}

	async function resolveDeferredChromePort(): Promise<AppShellDeferredChromePort> {
		const { org } = await resolveOrgRoute();

		if (!config.locals.actor) {
			throw redirect(303, '/auth/login');
		}

		return createDeferredChromePortFn({
			orgId: org.id,
			userId: config.locals.actor.userId,
			userSupabase: config.locals.supabase
		});
	}

	return {
		async loadFirstPaint() {
			return loadAppShellFirstPaint(await resolveFirstPaintRequest());
		},
		async loadDeferredChrome(part) {
			return loadAppShellDeferredChrome(part, await resolveDeferredChromePort());
		}
	};
}

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
			const membership = await (config.wrapMembershipLoad?.(() => loadMembershipRow(config)) ??
				loadMembershipRow(config));
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

async function loadMembershipRow(config: {
	orgId: string;
	userId: string;
	userSupabase: SupabaseClient;
}): Promise<MembershipRow> {
	const { data, error: membershipError } = await config.userSupabase
		.from('organization_memberships')
		.select('id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids')
		.eq('user_id', config.userId)
		.eq('organization_id', config.orgId)
		.maybeSingle();

	if (membershipError) {
		console.error('[supabase-org-shell] Failed to load membership row:', sanitizeErrorForLog(membershipError));
		throw error(500, 'Internal server error');
	}

	if (!data) {
		throw error(403, 'You are not a member of this organization');
	}

	assertNormalizedMembershipRow(data);
	return data as MembershipRow;
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
				loadUserOrgPreferences({
					orgId: config.orgId,
					userId: config.userId,
					userSupabase: config.userSupabase
				})
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

async function loadUserOrgPreferences(config: { orgId: string; userId: string; userSupabase: SupabaseClient }) {
	const { data, error: preferencesError } = await config.userSupabase
		.from('user_org_preferences')
		.select('preferences')
		.eq('organization_id', config.orgId)
		.eq('user_id', config.userId)
		.maybeSingle();

	if (preferencesError) {
		console.error('[app-shell] Failed to load user preferences:', preferencesError);
		return getDefaultUserOrgPreferences();
	}

	return data ? normalizeUserOrgPreferences(data.preferences) : getDefaultUserOrgPreferences();
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
