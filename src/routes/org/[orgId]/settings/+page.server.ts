import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrganizationMember, OrganizationMemberPermissions } from '$lib/types';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { GroupEntity } from '$lib/server/entities/group';
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

export const load: PageServerLoad = async ({ params, locals, cookies, parent }) => {
	const { orgId } = params;
	const parentData = await parent();
	const { orgName, userRole, allOrgs, isAdmin } = parentData;
	const permissions = parentData.permissions!;
	return loadWithContext(locals, cookies, orgId, {
		permission: 'none',
		fn: async (ctx) => {
			const canManageMembers = permissions.canManageMembers;
			const shouldLoadGovernanceData = userRole === 'owner' || userRole === 'admin' || canManageMembers;
			let membershipRows: Record<string, unknown>[] = [];
			let invitationRows: Record<string, unknown>[] = [];
			let groupRows: Record<string, unknown>[] = [];

			if (shouldLoadGovernanceData) {
				[membershipRows, invitationRows, groupRows] = await Promise.all([
					ctx.store.findMany<Record<string, unknown>>('organization_memberships', ctx.auth.orgId),
					ctx.store.findMany<Record<string, unknown>>('organization_invitations', ctx.auth.orgId, {
						status: 'pending'
					}),
					ctx.store.findMany<Record<string, unknown>>('groups', ctx.auth.orgId, undefined, {
						orderBy: [{ column: 'sort_order', ascending: true }]
					})
				]);
			}

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

			if (shouldLoadGovernanceData && isBillingEnabled) {
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

			return {
				orgId,
				orgName,
				permissions,
				allOrgs,
				members,
				invitations,
				isOwner: userRole === 'owner',
				isAdmin,
				canManageMembers,
				groups: GroupEntity.fromDbArray(groupRows).map((g) => ({ id: g.id, name: g.name })),
				exportInfo
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
