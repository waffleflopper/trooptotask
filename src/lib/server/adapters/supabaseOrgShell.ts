/**
 * Supabase-backed implementations of `OrgAccessPort` and `OrgChromePort` for the org shell split
 * (RFC #415). These are the production adapters; in-memory equivalents for tests live in
 * `inMemoryOrgShell.ts`.
 *
 * Both factories are pre-configured at construction time (orgId, userId, supabase clients) and
 * issue no DB queries until their port methods are called.
 */
import { error } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationMemberPermissions } from '$lib/types';
import type { EffectiveTier } from '$lib/types/subscription';
import type {
	OrgAccessPort,
	OrgChromePort,
	OrgWorkspacePort,
	WorkspaceKey,
	MembershipInfo,
	OrgState,
	ChromeData,
	Announcement
} from '../core/orgShell';
import { loadWithContext } from './httpAdapter';
import { fetchCalendarBootstrap } from '../core/useCases/calendarQuery';
import { getActiveOnboardingPersonnelIds } from '../core/useCases/onboardingCalendarQuery';
import { fetchOnboardingBootstrap } from '../core/useCases/onboardingQuery';
import { fetchDashboardBootstrap } from '../core/useCases/dashboardQuery';
import { fetchPersonnelBootstrap } from '../core/useCases/personnelWorkspaceQuery';
import { formatDate } from '$lib/utils/dates';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { GroupEntity } from '$lib/server/entities/group';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';
import { PinnedGroupsEntity } from '$lib/server/entities/pinnedGroups';
import type { Personnel } from '$lib/types';
import type { Group } from '$lib/stores/groups.svelte';
import type { PersonnelTraining, TrainingType, TrainingView } from '$features/training/training.types';

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
			const { data, error: membershipError } = await config.userSupabase
				.from('organization_memberships')
				.select(
					'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_view_onboarding, can_edit_onboarding, can_view_leaders_book, can_edit_leaders_book, can_manage_members, scoped_group_id'
				)
				.eq('user_id', config.userId)
				.eq('organization_id', config.orgId)
				.single();

			if (membershipError) {
				throw error(500, membershipError.message);
			}

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
				config.userSupabase.from('announcement_dismissals').select('announcement_id').eq('user_id', config.userId)
			]);

			if (membershipsRes.error) {
				console.error('[org-shell] Failed to load organization memberships for chrome data:', membershipsRes.error);
				throw new Error(`Failed to load organization memberships: ${membershipsRes.error.message}`);
			}

			if (notifRes.error) {
				console.error('[org-shell] Failed to load unread notification count for chrome data:', notifRes.error);
				throw new Error(`Failed to load unread notification count: ${notifRes.error.message}`);
			}

			if (announcementsRes.error) {
				console.error('[org-shell] Failed to load platform announcements for chrome data:', announcementsRes.error);
				throw new Error(`Failed to load platform announcements: ${announcementsRes.error.message}`);
			}

			if (dismissalsRes.error) {
				console.error('[org-shell] Failed to load announcement dismissals for chrome data:', dismissalsRes.error);
				throw new Error(`Failed to load announcement dismissals: ${dismissalsRes.error.message}`);
			}

			const allOrgs = (membershipsRes.data ?? [])
				.filter((m: Record<string, unknown>) => m.organizations)
				.map((m: Record<string, unknown>) => {
					const org = m.organizations as Record<string, unknown>;
					return { id: org.id as string, name: org.name as string, role: m.role as string };
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
				allOrgs
			};
		}
	};
}

export function createSupabaseCalendarWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'calendar') {
				throw new Error(`createSupabaseCalendarWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const now = new Date();
			// 3 months back (1st of the month) to 6 months forward (last day of month).
			// month+7, day 0 resolves to the last day of month+6 via JS Date overflow.
			const rangeStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
			const rangeEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 7, 0));

			const data = await loadWithContext(locals, cookies, orgId, {
				permission: 'calendar',
				fn: async (ctx) => {
					const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
						fetchCalendarBootstrap(ctx, { rangeStart, rangeEnd }),
						getActiveOnboardingPersonnelIds(ctx)
					]);
					return { ...calendarData, activeOnboardingPersonnelIds };
				}
			});

			return data as T;
		}
	};
}

export function createSupabaseTrainingWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'training') {
				throw new Error(`createSupabaseTrainingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await loadWithContext(locals, cookies, orgId, {
				permission: 'training',
				fn: async (ctx) => {
					const [personnelRows, groupRows, trainingTypeRows, trainingViewRows, pinnedGroupRows] = await Promise.all([
						ctx.store.findMany<Record<string, unknown>>('personnel', orgId, undefined, {
							select: PersonnelEntity.select,
							isNull: { archived_at: true },
							orderBy: [{ column: 'last_name', ascending: true }]
						}),
						ctx.store.findMany<Record<string, unknown>>('groups', orgId, undefined, {
							orderBy: [{ column: 'sort_order', ascending: true }]
						}),
						ctx.store.findMany<Record<string, unknown>>('training_types', orgId, undefined, {
							orderBy: [{ column: 'sort_order', ascending: true }]
						}),
						ctx.store.findMany<Record<string, unknown>>('training_views', orgId, undefined, {
							orderBy: [{ column: 'name', ascending: true }]
						}),
						ctx.auth.userId
							? ctx.store.findMany<Record<string, unknown>>(
									'user_pinned_groups',
									orgId,
									{ user_id: ctx.auth.userId },
									{
										orderBy: [{ column: 'sort_order', ascending: true }]
									}
								)
							: Promise.resolve([])
					]);

					const personnelTrainings: Promise<PersonnelTraining[]> = ctx.store
						.findMany<Record<string, unknown>>('personnel_trainings', orgId)
						.then((rows) => PersonnelTrainingEntity.fromDbArray(rows) as PersonnelTraining[]);

					return {
						personnel: PersonnelEntity.fromDbArray(personnelRows) as Personnel[],
						groups: GroupEntity.fromDbArray(groupRows) as Group[],
						pinnedGroups: PinnedGroupsEntity.fromDbArray(pinnedGroupRows),
						trainingTypes: TrainingTypeEntity.fromDbArray(trainingTypeRows) as TrainingType[],
						trainingViews: TrainingViewEntity.fromDbArray(trainingViewRows) as TrainingView[],
						personnelTrainings
					};
				}
			});

			return data as T;
		}
	};
}

export function createSupabaseOnboardingWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'onboarding') {
				throw new Error(`createSupabaseOnboardingWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await loadWithContext(locals, cookies, orgId, {
				permission: 'onboarding',
				fn: async (ctx) => fetchOnboardingBootstrap(ctx)
			});

			return data as T;
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
				permission: 'personnel',
				fn: async (ctx) => fetchPersonnelBootstrap(ctx)
			});

			return data as T;
		}
	};
}

export function createSupabaseDashboardWorkspacePort(
	locals: App.Locals,
	cookies: Cookies,
	orgId: string
): OrgWorkspacePort {
	return {
		async getWorkspaceData<T>(workspace: WorkspaceKey): Promise<T> {
			if (workspace !== 'dashboard') {
				throw new Error(`createSupabaseDashboardWorkspacePort: unsupported workspace '${workspace}'`);
			}

			const data = await loadWithContext(locals, cookies, orgId, {
				permission: 'none',
				fn: async (ctx) => fetchDashboardBootstrap(ctx)
			});

			return data as T;
		}
	};
}
