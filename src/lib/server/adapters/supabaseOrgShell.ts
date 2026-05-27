/**
 * Supabase-backed implementations of `OrgAccessPort` and `OrgChromePort` for the org shell split
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
	DeferredData,
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	StreamableOrgWorkspacePort,
	WorkspaceKey,
	MembershipInfo,
	OrgState,
	ChromeData,
	Announcement
} from '../core/orgShell';
import type { UseCaseContext } from '../core/ports';
import type { RootOrgLoadPort, RootOrgShellRequest } from '../core/orgShellCoordinator';
import { loadWithContext, getLayoutClient } from './httpAdapter';
import { getOrLoadRequestMembership } from '$lib/server/membershipContextCache';
import { fetchCalendarBootstrap, type CalendarBootstrap, type CalendarDateRange } from '../core/useCases/calendarQuery';
import { getActiveOnboardingPersonnelIds } from '../core/useCases/calendarQuery';
import { withCalendarTiming } from '$lib/server/utils/calendarTiming';
import { fetchOnboardingBootstrap } from '../core/useCases/onboardingQuery';
import { fetchDashboardBootstrap, type DashboardBootstrap } from '../core/useCases/dashboardQuery';
import { fetchPersonnelBootstrap, fetchRatingSchemeBootstrap } from '../core/useCases/personnelWorkspaceQuery';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { IctTaskEntity } from '$lib/server/entities/ictTask';
import { PersonnelIctCompletionEntity } from '$lib/server/entities/personnelIctCompletion';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';
import { createSupabaseSubscriptionAdapter } from './supabaseSubscription';
import type { CriticalTasksBootstrap, TrainingBootstrap } from '../core/orgShell';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/criticalTasks.types';
import { createInitialCalendarBufferedRange } from '$features/calendar/utils/calendarRange';
import { CALENDAR_ANCHOR_COOKIE, resolveCalendarAnchorDate } from '$features/calendar/utils/calendarAnchorDate';
import {
	getPreferredOrganizationUrlSegment,
	resolveOrganizationRouteIdentity
} from '$lib/server/core/useCases/organizationUrlSlug';

export interface SupabaseRootOrgLoadPortDeps {
	getLayoutClient?: typeof getLayoutClient;
	createSubscriptionAdapter?: typeof createSupabaseSubscriptionAdapter;
	createOrgAccessPort?: typeof createSupabaseOrgAccessPort;
	createOrgChromePort?: typeof createSupabaseOrgChromePort;
}

export function createSupabaseRootOrgLoadPort(
	config: {
		locals: App.Locals;
		cookies: Cookies;
		orgSegment: string;
		url?: URL;
	},
	deps: SupabaseRootOrgLoadPortDeps = {}
): RootOrgLoadPort {
	const getLayoutClientFn = deps.getLayoutClient ?? getLayoutClient;
	const createSubscriptionAdapterFn = deps.createSubscriptionAdapter ?? createSupabaseSubscriptionAdapter;
	const createOrgAccessPortFn = deps.createOrgAccessPort ?? createSupabaseOrgAccessPort;
	const createOrgChromePortFn = deps.createOrgChromePort ?? createSupabaseOrgChromePort;

	return {
		async resolveRequest(): Promise<RootOrgShellRequest> {
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

			const subscriptionAdapter = createSubscriptionAdapterFn(supabase, org.id);
			const effectiveTierPromise = subscriptionAdapter.getEffectiveTier();

			return {
				kind: 'shell',
				orgUrlSegment,
				access: createOrgAccessPortFn({
					orgId: org.id,
					userId: config.locals.user.id,
					userSupabase: config.locals.supabase,
					orgName: org.name ?? 'Organization',
					getEffectiveTier: () => effectiveTierPromise,
					wrapMembershipLoad: (loadMembershipRow) =>
						getOrLoadRequestMembership(config.locals, config.locals.user?.id ?? null, org.id, loadMembershipRow)
				}),
				chrome: createOrgChromePortFn({
					orgId: org.id,
					userId: config.locals.user.id,
					userSupabase: config.locals.supabase,
					supabase
				})
			};
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
				permissions: access.permissions,
				scopedGroupId: access.scopedGroupId,
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
			const [membershipsRes, notifRes, announcementsRes, dismissalsRes, userPrefsRes] = await Promise.all([
				selectAllSupabaseRows<Record<string, unknown>>(
					(from, to) =>
						config.userSupabase
							.from('organization_memberships')
							.select('role, organizations(id, name, url_slug)')
							.eq('user_id', config.userId)
							.range(from, to) as unknown as Promise<{
							data: Record<string, unknown>[] | null;
							error: unknown;
						}>
				),
				config.userSupabase
					.from('notifications')
					.select('id', { count: 'exact', head: true })
					.eq('user_id', config.userId)
					.eq('organization_id', config.orgId)
					.eq('read', false),
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
				),
				config.userSupabase
					.from('user_org_preferences')
					.select('preferences')
					.eq('organization_id', config.orgId)
					.eq('user_id', config.userId)
					.maybeSingle()
			]);

			if (membershipsRes.error) {
				console.error('[org-shell] Failed to load organization memberships for chrome data:', membershipsRes.error);
				throw new Error(
					`Failed to load organization memberships: ${(membershipsRes.error as { message?: string }).message ?? 'Unknown error'}`
				);
			}

			if (notifRes.error) {
				console.error('[org-shell] Failed to load unread notification count for chrome data:', notifRes.error);
				throw new Error(`Failed to load unread notification count: ${notifRes.error.message}`);
			}

			if (announcementsRes.error) {
				console.error('[org-shell] Failed to load platform announcements for chrome data:', announcementsRes.error);
				throw new Error(
					`Failed to load platform announcements: ${(announcementsRes.error as { message?: string }).message ?? 'Unknown error'}`
				);
			}

			if (dismissalsRes.error) {
				console.error('[org-shell] Failed to load announcement dismissals for chrome data:', dismissalsRes.error);
				throw new Error(
					`Failed to load announcement dismissals: ${(dismissalsRes.error as { message?: string }).message ?? 'Unknown error'}`
				);
			}

			if (userPrefsRes.error) {
				console.error('[org-shell] Failed to load user preferences for chrome data:', userPrefsRes.error);
				throw new Error(`Failed to load user preferences: ${userPrefsRes.error.message}`);
			}

			const allOrgs = (membershipsRes.data ?? [])
				.filter((m: Record<string, unknown>) => m.organizations)
				.map((m: Record<string, unknown>) => {
					const org = m.organizations as Record<string, unknown>;
					return {
						id: org.id as string,
						name: org.name as string,
						role: m.role as string,
						urlSegment: getPreferredOrganizationUrlSegment({
							id: org.id as string,
							urlSlug: org.url_slug as string | null
						})
					};
				});

			const dismissedIds = new Set((dismissalsRes.data ?? []).map((d: Record<string, unknown>) => d.announcement_id));
			const activeAnnouncements: Announcement[] = (announcementsRes.data ?? [])
				.filter((a: Record<string, unknown>) => !dismissedIds.has(a.id))
				.map((a: Record<string, unknown>) => ({
					id: a.id as string,
					title: a.title as string,
					message: a.message as string,
					type: a.type as 'info' | 'warning' | 'maintenance'
				}));

			return {
				unreadNotificationCount: notifRes.count ?? 0,
				activeAnnouncements,
				allOrgs,
				userPreferences: userPrefsRes.data
					? normalizeUserOrgPreferences(userPrefsRes.data.preferences)
					: getDefaultUserOrgPreferences()
			};
		}
	};
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

export function createSupabaseTrainingWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): StreamableOrgWorkspacePort {
	function getTrainingData(): Promise<TrainingBootstrap>;
	function getTrainingData(defer: true): Promise<DeferredData<TrainingBootstrap>>;
	function getTrainingData(defer: boolean = false): Promise<TrainingBootstrap | DeferredData<TrainingBootstrap>> {
		const fn = async (ctx: UseCaseContext) => {
			const canonicalOrgId = ctx.auth.orgId;
			const loadTrainingItems = <T>(
				label: string,
				load: Promise<Record<string, unknown>[]>,
				mapRows: (rows: Record<string, unknown>[]) => T
			): Promise<T> =>
				load.then(mapRows).catch((error) => {
					console.error(`[training-workspace] Failed to load ${label}`, {
						orgId,
						error
					});
					throw error;
				});

			const personnel = loadTrainingItems(
				'personnel',
				ctx.store.findMany<Record<string, unknown>>('personnel', canonicalOrgId, undefined, {
					select: PersonnelEntity.select,
					isNull: { archived_at: true },
					orderBy: [{ column: 'last_name', ascending: true }]
				}),
				(rows) => PersonnelEntity.fromDbArray(rows) as Personnel[]
			);
			const groups = loadTrainingItems(
				'groups',
				ctx.store.findMany<Record<string, unknown>>('groups', canonicalOrgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				}),
				(rows) => GroupEntity.fromDbArray(rows) as Group[]
			);
			const trainingTypes = loadTrainingItems(
				'training types',
				ctx.store.findMany<Record<string, unknown>>('training_types', canonicalOrgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				}),
				(rows) => TrainingTypeEntity.fromDbArray(rows) as TrainingType[]
			);
			const trainingViews = loadTrainingItems(
				'training views',
				ctx.store.findMany<Record<string, unknown>>('training_views', canonicalOrgId, undefined, {
					orderBy: [{ column: 'name', ascending: true }]
				}),
				(rows) => TrainingViewEntity.fromDbArray(rows) as TrainingView[]
			);
			const pinnedGroups = ctx.auth.userId
				? loadTrainingItems(
						'pinned groups',
						ctx.store.findMany<Record<string, unknown>>(
							'user_pinned_groups',
							canonicalOrgId,
							{ user_id: ctx.auth.userId },
							{
								orderBy: [{ column: 'sort_order', ascending: true }]
							}
						),
						(rows) => PinnedGroupsEntity.fromDbArray(rows)
					)
				: Promise.resolve([]);

			const personnelTrainings = loadTrainingItems(
				'personnel trainings',
				ctx.store.findMany<Record<string, unknown>>('personnel_trainings', canonicalOrgId),
				(rows) => PersonnelTrainingEntity.fromDbArray(rows) as PersonnelTraining[]
			);

			return {
				personnel,
				groups,
				pinnedGroups,
				trainingTypes,
				trainingViews,
				personnelTrainings
			};
		};

		if (defer) {
			return loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
				policyResource: { kind: 'unscoped' },
				defer: true,
				fn
			});
		}

		return loadWithContext(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.training.viewMatrix,
			policyResource: { kind: 'unscoped' },
			fn
		});
	}

	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'training') {
				throw new Error(`createSupabaseTrainingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await getTrainingData();

			return data as T;
		},
		async streamWorkspaceData<T>(workspace: WorkspaceKey) {
			if (workspace !== 'training') {
				throw new Error(`createSupabaseTrainingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			return getTrainingData(true) as Promise<DeferredData<T>>;
		}
	};
}

export function createSupabaseCriticalTasksWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): StreamableOrgWorkspacePort {
	function getCriticalTasksData(): Promise<CriticalTasksBootstrap>;
	function getCriticalTasksData(defer: true): Promise<DeferredData<CriticalTasksBootstrap>>;
	function getCriticalTasksData(
		defer: boolean = false
	): Promise<CriticalTasksBootstrap> | Promise<DeferredData<CriticalTasksBootstrap>> {
		const fn = async (ctx: UseCaseContext) => {
			const canonicalOrgId = ctx.auth.orgId;
			const loadCriticalTasksItems = <T>(
				label: string,
				load: Promise<Record<string, unknown>[]>,
				mapRows: (rows: Record<string, unknown>[]) => T
			): Promise<T> =>
				load.then(mapRows).catch((error) => {
					console.error(`[critical-tasks-workspace] Failed to load ${label}`, {
						orgId,
						error
					});
					throw error;
				});

			const personnel = loadCriticalTasksItems(
				'personnel',
				ctx.store.findMany<Record<string, unknown>>('personnel', canonicalOrgId, undefined, {
					select: PersonnelEntity.select,
					isNull: { archived_at: true },
					orderBy: [{ column: 'last_name', ascending: true }]
				}),
				(rows) => PersonnelEntity.fromDbArray(rows) as Personnel[]
			);
			const groups = loadCriticalTasksItems(
				'groups',
				ctx.store.findMany<Record<string, unknown>>('groups', canonicalOrgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				}),
				(rows) => GroupEntity.fromDbArray(rows) as Group[]
			);
			const ictTasks = loadCriticalTasksItems(
				'ICT tasks',
				ctx.store.findMany<Record<string, unknown>>('ict_tasks', canonicalOrgId, undefined, {
					isNull: { archived_at: true },
					orderBy: [
						{ column: 'sort_order', ascending: true },
						{ column: 'task_code', ascending: true }
					]
				}),
				(rows) => IctTaskEntity.fromDbArray(rows) as IctTask[]
			);
			const personnelIctCompletions = Promise.all([personnel, ictTasks])
				.then(([loadedPersonnel, loadedTasks]) =>
					ctx.criticalTasksReadModel.findLatestCompletions(canonicalOrgId, {
						personnelIds: loadedPersonnel.map((person) => person.id),
						taskIds: loadedTasks.map((task) => task.id)
					})
				)
				.then((rows) => PersonnelIctCompletionEntity.fromDbArray(rows) as PersonnelIctCompletion[])
				.catch((error) => {
					console.error('[critical-tasks-workspace] Failed to load personnel ICT completions', {
						orgId,
						error
					});
					throw error;
				});

			return {
				personnel,
				groups,
				ictTasks,
				personnelIctCompletions
			};
		};

		if (defer) {
			return loadWithContext(locals, cookies, orgId, {
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
				policyResource: { kind: 'unscoped' },
				defer: true,
				fn
			});
		}

		return loadWithContext(locals, cookies, orgId, {
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.viewReadiness,
			policyResource: { kind: 'unscoped' },
			fn
		});
	}

	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'critical-tasks') {
				throw new Error(`createSupabaseCriticalTasksWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await getCriticalTasksData();

			return data as T;
		},
		async streamWorkspaceData<T>(workspace: WorkspaceKey) {
			if (workspace !== 'critical-tasks') {
				throw new Error(`createSupabaseCriticalTasksWorkspacePort: unsupported workspace '${workspace}'`);
			}

			return getCriticalTasksData(true) as Promise<DeferredData<T>>;
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
