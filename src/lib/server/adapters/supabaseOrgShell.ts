/**
 * Supabase-backed implementations of App Shell and workspace ports for the org shell split
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
import type { EffectiveTier } from '$lib/types/subscription';
import { assertNormalizedMembershipRow, type MembershipRow } from '$lib/server/permissionContext';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { getDefaultUserOrgPreferences, normalizeUserOrgPreferences } from '$lib/preferences/userPreferences';
import type {
	AppShellDeferredChromePort,
	AppShellFirstPaintChrome,
	AppShellFirstPaintChromePort,
	AppShellRequest,
	DeferredData,
	OrgAccessPort,
	OrgWorkspacePort,
	StreamableOrgWorkspacePort,
	WorkspaceKey,
	MembershipInfo,
	OrgState,
	Announcement,
	OrganizationSwitcherOrg
} from '../core/orgShell';
import type { UseCaseContext } from '../core/ports';
import {
	loadAppShellDeferredChrome,
	loadAppShellFirstPaint,
	type AppShellFirstPaintRequest
} from '../core/useCases/loadAppShell';
import { loadWithContext, getLayoutClient } from './httpAdapter';
import { getOrLoadRequestMembership } from '$lib/server/membershipContextCache';
import { fetchCalendarBootstrap, type CalendarBootstrap, type CalendarDateRange } from '../core/useCases/calendarQuery';
import { getActiveOnboardingPersonnelIds } from '../core/useCases/calendarQuery';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { fetchOnboardingBootstrap } from '../core/useCases/onboardingQuery';
import { fetchDashboardBootstrap, type DashboardBootstrap } from '../core/useCases/dashboardQuery';
import { fetchPersonnelBootstrap, fetchRatingSchemeBootstrap } from '../core/useCases/personnelWorkspaceQuery';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';
import { createInitialCalendarBufferedRange } from '$features/calendar/utils/calendarRange';
import { CALENDAR_ANCHOR_COOKIE, resolveCalendarAnchorDate } from '$features/calendar/utils/calendarAnchorDate';
import {
	getPreferredOrganizationUrlSegment,
	resolveOrganizationRouteIdentity
} from '$lib/server/core/useCases/organizationUrlSlug';

export interface SupabaseAppShellRequestDeps {
	getLayoutClient?: typeof getLayoutClient;
	createSubscriptionAdapter?: typeof createSupabaseSubscriptionAdapter;
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
	const createSubscriptionAdapterFn = deps.createSubscriptionAdapter ?? createSupabaseSubscriptionAdapter;
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

		if (!config.locals.user) {
			throw redirect(303, '/auth/login');
		}

		const user = config.locals.user;
		const subscriptionAdapter = createSubscriptionAdapterFn(supabase, org.id);
		const effectiveTierPromise = subscriptionAdapter.getEffectiveTier();

		return {
			kind: 'ready',
			orgUrlSegment,
			access: createOrgAccessPortFn({
				orgId: org.id,
				userId: user.id,
				userSupabase: config.locals.supabase,
				orgName: org.name ?? 'Organization',
				getEffectiveTier: () => effectiveTierPromise,
				wrapMembershipLoad: (loadMembershipRow) =>
					getOrLoadRequestMembership(config.locals, user.id, org.id, loadMembershipRow)
			}),
			chrome: createFirstPaintChromePortFn({
				orgId: org.id,
				userId: user.id,
				userSupabase: config.locals.supabase,
				supabase
			})
		};
	}

	async function resolveDeferredChromePort(): Promise<AppShellDeferredChromePort> {
		const { org } = await resolveOrgRoute();

		if (!config.locals.user) {
			throw redirect(303, '/auth/login');
		}

		return createDeferredChromePortFn({
			orgId: org.id,
			userId: config.locals.user.id,
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
	/** Delegate to the existing subscription adapter — avoids re-instantiating it. */
	getEffectiveTier: () => Promise<EffectiveTier>;
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
			const effectiveTier = await config.getEffectiveTier();
			return {
				orgName: config.orgName,
				effectiveTier
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
		throw error(500, membershipError.message);
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
	/** Service-role or anon client for platform announcements. */
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
		async getUnreadNotificationCount(): Promise<number> {
			const { count, error: notificationError } = await config.userSupabase
				.from('notifications')
				.select('id', { count: 'exact', head: true })
				.eq('user_id', config.userId)
				.eq('organization_id', config.orgId)
				.eq('read', false);

			if (notificationError) {
				throw new Error(`Failed to load unread notification count: ${notificationError.message}`);
			}

			return count ?? 0;
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
		const [announcementsRes, dismissalsRes] = await Promise.all([
			selectAllSupabaseRows<Record<string, unknown>>(
				(from, to) =>
					config.supabase
						.from('platform_announcements')
						.select('id, title, message, type')
						.eq('is_active', true)
						.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
						.range(from, to) as unknown as Promise<{
						data: Record<string, unknown>[] | null;
						error: unknown;
					}>
			),
			selectAllSupabaseRows<Record<string, unknown>>(
				(from, to) =>
					config.userSupabase
						.from('announcement_dismissals')
						.select('announcement_id')
						.eq('user_id', config.userId)
						.range(from, to) as unknown as Promise<{
						data: Record<string, unknown>[] | null;
						error: unknown;
					}>
			)
		]);

		if (announcementsRes.error) {
			throw new Error(
				`Failed to load platform announcements: ${(announcementsRes.error as { message?: string }).message ?? 'Unknown error'}`
			);
		}

		if (dismissalsRes.error) {
			throw new Error(
				`Failed to load announcement dismissals: ${(dismissalsRes.error as { message?: string }).message ?? 'Unknown error'}`
			);
		}

		const dismissedIds = new Set((dismissalsRes.data ?? []).map((dismissal) => dismissal.announcement_id));

		return (announcementsRes.data ?? [])
			.filter((announcement) => !dismissedIds.has(announcement.id))
			.map((announcement) => ({
				id: announcement.id as string,
				title: announcement.title as string,
				message: announcement.message as string,
				type: announcement.type as 'info' | 'warning' | 'maintenance'
			}));
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
	const membershipsRes = await selectAllSupabaseRows<Record<string, unknown>>(
		(from, to) =>
			config.userSupabase
				.from('organization_memberships')
				.select('role, organizations(id, name, url_slug)')
				.eq('user_id', config.userId)
				.range(from, to) as unknown as Promise<{
				data: Record<string, unknown>[] | null;
				error: unknown;
			}>
	);

	if (membershipsRes.error) {
		throw new Error(
			`Failed to load organization memberships: ${(membershipsRes.error as { message?: string }).message ?? 'Unknown error'}`
		);
	}

	return (membershipsRes.data ?? [])
		.filter((membership) => membership.organizations)
		.map((membership) => {
			const org = membership.organizations as Record<string, unknown>;
			return {
				id: org.id as string,
				name: org.name as string,
				role: membership.role as string,
				urlSegment: getPreferredOrganizationUrlSegment({
					id: org.id as string,
					urlSlug: org.url_slug as string | null
				})
			};
		});
}

export function createSupabaseCalendarWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string,
	options: { specialDaysRange?: CalendarDateRange } = {}
): StreamableOrgWorkspacePort {
	function getCalendarData(): Promise<CalendarBootstrap>;
	function getCalendarData(defer: true): Promise<DeferredData<CalendarBootstrap>>;
	function getCalendarData(defer = false) {
		const anchorDate = resolveCalendarAnchorDate(cookies.get(CALENDAR_ANCHOR_COOKIE), new Date());
		const { rangeStart, rangeEnd } = createInitialCalendarBufferedRange(anchorDate);

		const fn = async (ctx: UseCaseContext) =>
			withCalendarTiming(orgId, 'workspace-bootstrap', async () => {
				const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
					fetchCalendarBootstrap(ctx, { rangeStart, rangeEnd, specialDaysRange: options.specialDaysRange }),
					getActiveOnboardingPersonnelIds(ctx)
				]);
				return { ...calendarData, activeOnboardingPersonnelIds };
			});

		if (defer) {
			return loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
				policyResource: { kind: 'unscoped' },
				defer: true,
				fn
			});
		}

		return loadWithContext(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.calendar.viewAvailability,
			policyResource: { kind: 'unscoped' },
			fn
		});
	}

	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'calendar') {
				throw new Error(`createSupabaseCalendarWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await getCalendarData();

			return data as T;
		},
		async streamWorkspaceData<T>(workspace: WorkspaceKey) {
			if (workspace !== 'calendar') {
				throw new Error(`createSupabaseCalendarWorkspacePort: unsupported workspace '${workspace}'`);
			}

			return getCalendarData(true) as Promise<DeferredData<T>>;
		}
	};
}

export function createSupabaseOnboardingWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): StreamableOrgWorkspacePort {
	function getOnboardingData(): Promise<Awaited<ReturnType<typeof fetchOnboardingBootstrap>>>;
	function getOnboardingData(defer: true): Promise<DeferredData<Awaited<ReturnType<typeof fetchOnboardingBootstrap>>>>;
	function getOnboardingData(defer = false) {
		const fn = async (ctx: UseCaseContext) => fetchOnboardingBootstrap(ctx);

		if (defer) {
			return loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
				policyResource: { kind: 'unscoped' },
				defer: true,
				fn
			});
		}

		return loadWithContext(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
			policyResource: { kind: 'unscoped' },
			fn
		});
	}

	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'onboarding') {
				throw new Error(`createSupabaseOnboardingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await getOnboardingData();

			return data as T;
		},
		async streamWorkspaceData<T>(workspace: WorkspaceKey) {
			if (workspace !== 'onboarding') {
				throw new Error(`createSupabaseOnboardingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			return getOnboardingData(true) as Promise<DeferredData<T>>;
		}
	};
}

export function createSupabasePersonnelWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'personnel') {
				throw new Error(`createSupabasePersonnelWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => fetchPersonnelBootstrap(ctx)
			});

			return data as T;
		}
	};
}

export function createSupabaseRatingSchemeWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'rating-scheme') {
				throw new Error(`createSupabaseRatingSchemeWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
				policyResource: { kind: 'unscoped' },
				fn: async (ctx) => fetchRatingSchemeBootstrap(ctx)
			});

			return data as T;
		}
	};
}

export function createSupabaseDashboardWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): StreamableOrgWorkspacePort {
	function getDashboardData(): Promise<DashboardBootstrap>;
	function getDashboardData(defer: true): Promise<DeferredData<DashboardBootstrap>>;
	function getDashboardData(defer = false) {
		const fn = async (ctx: UseCaseContext) => fetchDashboardBootstrap(ctx);

		if (defer) {
			return loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				defer: true,
				fn
			});
		}

		return loadWithContext(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
			fn
		});
	}

	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'dashboard') {
				throw new Error(`createSupabaseDashboardWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await getDashboardData();

			return data as T;
		},
		async streamWorkspaceData<T>(workspace: WorkspaceKey) {
			if (workspace !== 'dashboard') {
				throw new Error(`createSupabaseDashboardWorkspacePort: unsupported workspace '${workspace}'`);
			}

			return getDashboardData(true) as Promise<DeferredData<T>>;
		}
	};
}
