import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrganizationMember, OrganizationMemberPermissions } from '$lib/types';
import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { GroupEntity } from '$lib/server/entities/group';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { getAdminClient } from '$lib/server/supabase';
import { fetchAuditLogs } from '$lib/server/core/useCases/auditLogQuery';
import {
	deleteOrganization as deleteOrganizationUseCase,
	renameOrganization,
	transferOrganizationOwnership
} from '$lib/server/core/useCases/orgSettingsAdministration';
import {
	inviteOrganizationMember,
	removeOrganizationMember,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions
} from '$lib/server/core/useCases/orgSettingsMemberManagement';

interface OrganizationSettingsRow {
	archive_retention_months?: number | null;
	loss_warning_window_days?: number | null;
	critical_tasks_default_expiration_months?: number | null;
	critical_tasks_expiring_soon_warning_days?: number | null;
}

type DeletionRequestStatus = 'pending' | 'approved' | 'denied';

interface DeletionRequestRow {
	id: string;
	status: DeletionRequestStatus;
	requester_email: string | null;
	resource_description: string | null;
	resource_type: string;
	resource_url: string | null;
	created_at: string;
	denial_reason: string | null;
}

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();
	const { orgName, userRole, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;
	if (userRole !== 'owner' && userRole !== 'admin') {
		throw error(403, 'Only organization owners and admins can access organization settings');
	}

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			const adminStore = createSupabaseDataStore(getAdminClient());
			const [
				membershipRows,
				invitationRows,
				groupRows,
				organizationSettings,
				archivedPersonnelRows,
				approvalRequests,
				auditLog
			] = await Promise.all([
				ctx.store.findMany<Record<string, unknown>>('organization_memberships', ctx.auth.orgId),
				ctx.store.findMany<Record<string, unknown>>('organization_invitations', ctx.auth.orgId, {
					status: 'pending'
				}),
				ctx.store.findMany<Record<string, unknown>>('groups', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				}),
				ctx.rawStore.findOne<OrganizationSettingsRow>(
					'organizations',
					ctx.auth.orgId,
					{},
					'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
				),
				ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
					select: PersonnelEntity.select,
					isNull: { archived_at: false },
					orderBy: [{ column: 'archived_at', ascending: false }]
				}),
				ctx.store.findMany<DeletionRequestRow>('deletion_requests', ctx.auth.orgId, undefined, {
					orderBy: [{ column: 'created_at', ascending: false }]
				}),
				fetchAuditLogs(ctx, adminStore, { page: 1, limit: 100 })
			]);

			const members = membershipRows.map((m) => ({
				id: m.id as string,
				organizationId: orgId,
				userId: m.user_id as string,
				email: m.email as string,
				role: m.role as string,
				scopedGroupId: m.scoped_group_id as string | null,
				createdAt: m.created_at as string,
				canViewCalendar: m.can_view_calendar as boolean,
				canEditCalendar: m.can_edit_calendar as boolean,
				canViewPersonnel: m.can_view_personnel as boolean,
				canEditPersonnel: m.can_edit_personnel as boolean,
				canViewTraining: m.can_view_training as boolean,
				canEditTraining: m.can_edit_training as boolean,
				canViewCriticalTasks: m.can_view_critical_tasks as boolean,
				canEditCriticalTasks: m.can_edit_critical_tasks as boolean,
				canViewOnboarding: m.can_view_onboarding as boolean,
				canEditOnboarding: m.can_edit_onboarding as boolean,
				canViewRatingScheme: (m.can_view_rating_scheme as boolean | undefined) ?? (m.can_view_personnel as boolean),
				canEditRatingScheme:
					(m.can_edit_rating_scheme as boolean | undefined) ??
					((m.can_edit_personnel as boolean) && (m.can_edit_leaders_book as boolean)),
				canViewLeadersBook: m.can_view_leaders_book as boolean,
				canEditLeadersBook: m.can_edit_leaders_book as boolean,
				canManageMembers: m.can_manage_members as boolean
			})) as OrganizationMember[];

			const invitations = invitationRows.map((inv) => ({
				id: inv.id as string,
				email: inv.email as string,
				status: inv.status as string,
				createdAt: inv.created_at as string,
				scopedGroupId: inv.scoped_group_id as string | null,
				canViewCalendar: inv.can_view_calendar as boolean,
				canEditCalendar: inv.can_edit_calendar as boolean,
				canViewPersonnel: inv.can_view_personnel as boolean,
				canEditPersonnel: inv.can_edit_personnel as boolean,
				canViewTraining: inv.can_view_training as boolean,
				canEditTraining: inv.can_edit_training as boolean,
				canViewCriticalTasks: inv.can_view_critical_tasks as boolean,
				canEditCriticalTasks: inv.can_edit_critical_tasks as boolean,
				canViewOnboarding: inv.can_view_onboarding as boolean,
				canEditOnboarding: inv.can_edit_onboarding as boolean,
				canViewRatingScheme: (inv.can_view_rating_scheme as boolean | undefined) ?? (inv.can_view_personnel as boolean),
				canEditRatingScheme:
					(inv.can_edit_rating_scheme as boolean | undefined) ??
					((inv.can_edit_personnel as boolean) && (inv.can_edit_leaders_book as boolean)),
				canViewLeadersBook: inv.can_view_leaders_book as boolean,
				canEditLeadersBook: inv.can_edit_leaders_book as boolean,
				canManageMembers: inv.can_manage_members as boolean
			}));

			let exportInfo: { exportsUsed: number; exportsLimit: number; isLimited: boolean } = {
				exportsUsed: 0,
				exportsLimit: Infinity,
				isLimited: false
			};

			if (isBillingEnabled) {
				const [tier, exportCount] = await Promise.all([
					ctx.subscription.getEffectiveTier(),
					ctx.subscription.getMonthlyExportCount()
				]);
				const config = TIER_CONFIG[tier.tier];
				exportInfo = {
					exportsUsed: exportCount,
					exportsLimit: config.bulkExportsPerMonth,
					isLimited: config.bulkExportsPerMonth !== Infinity
				};
			}

			const retentionMonths = organizationSettings?.archive_retention_months ?? 36;
			const archivedPersonnel = PersonnelEntity.fromDbArray(archivedPersonnelRows).map((p) => ({
				id: p.id,
				rank: p.rank,
				firstName: p.firstName,
				lastName: p.lastName,
				mos: p.mos,
				groupName: p.groupName,
				archivedAt: p.archivedAt as string,
				groupId: p.groupId
			}));
			const pendingApprovalsCount = approvalRequests.filter((request) => request.status === 'pending').length;

			return {
				orgId,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				members,
				invitations,
				isOwner: userRole === 'owner',
				isAdmin,
				canManageMembers: userRole === 'owner' || userRole === 'admin' || permissions.canManageMembers,
				groups: GroupEntity.fromDbArray(groupRows).map((g) => ({ id: g.id, name: g.name })),
				exportInfo,
				policies: {
					retentionMonths,
					lossWarningWindowDays: organizationSettings?.loss_warning_window_days ?? 180,
					criticalTasksSettings: normalizeCriticalTasksSettings({
						defaultExpirationMonths: organizationSettings?.critical_tasks_default_expiration_months ?? null,
						expiringSoonWarningDays: organizationSettings?.critical_tasks_expiring_soon_warning_days ?? null
					})
				},
				archivedPersonnel,
				approvalRequests,
				pendingApprovalsCount,
				auditLog
			};
		}
	});
};

export const actions: Actions = {
	updateName: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await renameOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					name: (formData.get('name') as string) ?? ''
				}
			);
		} catch (error) {
			return toActionFailure('error', error);
		}
	},

	invite: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{
					email: (formData.get('email') as string) ?? '',
					preset: (formData.get('preset') as string) ?? '',
					scopedGroupId: ((formData.get('scopedGroupId') as string) || null) ?? null,
					actorEmail: user.email
				}
			);
		} catch (error) {
			return toActionFailure('inviteError', error);
		}
	},

	revokeInvite: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await revokeOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{ inviteId: (formData.get('inviteId') as string) ?? '' }
			);
		} catch (error) {
			return toActionFailure('inviteError', error);
		}
	},

	removeMember: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await removeOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{
					membershipId: (formData.get('membershipId') as string) ?? '',
					actorEmail: user.email
				}
			);
		} catch (error) {
			return toActionFailure('memberError', error);
		}
	},

	updatePermissions: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await updateOrganizationMemberPermissions(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{
					membershipId: (formData.get('membershipId') as string) ?? '',
					preset: (formData.get('preset') as string) ?? '',
					scopedGroupId: ((formData.get('scopedGroupId') as string) || null) ?? null,
					customPermissions: parseCustomPermissions(formData),
					actorEmail: user.email
				}
			);
		} catch (error) {
			return toActionFailure('permissionError', error);
		}
	},

	transferOwnership: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					newOwnerId: (formData.get('newOwnerId') as string) ?? ''
				}
			);
		} catch (error) {
			return toActionFailure('transferError', error);
		}
	},

	deleteOrganization: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			await deleteOrganizationUseCase(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					confirmName: (formData.get('confirmName') as string) ?? ''
				}
			);
		} catch (error) {
			return toActionFailure('deleteError', error);
		}

		throw redirect(303, '/dashboard?show=all');
	}
};

function parseCustomPermissions(formData: FormData): OrganizationMemberPermissions {
	return {
		canViewCalendar: formData.get('canViewCalendar') === 'on',
		canEditCalendar: formData.get('canEditCalendar') === 'on',
		canViewPersonnel: formData.get('canViewPersonnel') === 'on',
		canEditPersonnel: formData.get('canEditPersonnel') === 'on',
		canViewTraining: formData.get('canViewTraining') === 'on',
		canEditTraining: formData.get('canEditTraining') === 'on',
		canViewCriticalTasks: formData.get('canViewCriticalTasks') === 'on',
		canEditCriticalTasks: formData.get('canEditCriticalTasks') === 'on',
		canViewOnboarding: formData.get('canViewOnboarding') === 'on',
		canEditOnboarding: formData.get('canEditOnboarding') === 'on',
		canViewRatingScheme: formData.get('canViewRatingScheme') === 'on',
		canEditRatingScheme: formData.get('canEditRatingScheme') === 'on',
		canViewLeadersBook: formData.get('canViewLeadersBook') === 'on',
		canEditLeadersBook: formData.get('canEditLeadersBook') === 'on',
		canManageMembers: formData.get('canManageMembers') === 'on'
	};
}

function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { [errorKey]: error.message });
	}

	throw error;
}
