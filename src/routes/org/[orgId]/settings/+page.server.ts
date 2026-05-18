import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { OrganizationMember, OrganizationMemberPermissions } from '$lib/types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { projectStoredMemberAccessPresentation } from '$lib/access/memberAccessProjection';
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
import { fetchAuditLogPreview } from '$lib/server/core/useCases/auditLogQuery';
import {
	clearOrganizationUrlSlug,
	deleteOrganization as deleteOrganizationUseCase,
	renameOrganization,
	transferOrganizationOwnership,
	updateOrganizationUrlSlug
} from '$lib/server/core/useCases/orgSettingsAdministration';
import {
	inviteOrganizationMember,
	parseCapabilityOverrides,
	removeOrganizationMember,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
import type { DeletionRequestRow, OrganizationSettingsRow } from './settingsRows.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, userRole, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			await requireGovernancePolicy(
				{ auth: ctx.auth, audit: ctx.audit },
				POLICY_ACTION_CATALOG.organization.accessGovernance
			);

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
				fetchAuditLogPreview(ctx, adminStore, { limit: 9 })
			]);

			const members = membershipRows.map((m) => {
				const access = projectStoredMemberAccessPresentation(toAccessPresentationRow(m));
				return {
					id: m.id as string,
					organizationId: orgId,
					userId: m.user_id as string,
					email: m.email as string,
					role: m.role as string,
					scopedGroupId: access.scopedGroupId,
					memberPreset: access.memberPreset,
					capabilityOverrides: access.capabilityOverrides,
					accessScopeKind: access.accessScopeKind,
					accessScopeGroupIds: access.accessScopeGroupIds,
					createdAt: m.created_at as string,
					...access.permissions
				};
			}) as OrganizationMember[];

			const invitations = invitationRows.map((inv) => {
				const access = projectStoredMemberAccessPresentation(toAccessPresentationRow(inv));
				return {
					id: inv.id as string,
					email: inv.email as string,
					status: inv.status as string,
					createdAt: inv.created_at as string,
					scopedGroupId: access.scopedGroupId,
					memberPreset: access.memberPreset,
					capabilityOverrides: access.capabilityOverrides,
					accessScopeKind: access.accessScopeKind,
					accessScopeGroupIds: access.accessScopeGroupIds,
					...access.permissions
				};
			});

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
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				members,
				invitations,
				isOwner: userRole === 'owner',
				isAdmin,
				canManageMembers: userRole === 'owner' || userRole === 'admin',
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
					readOnlyGuard: ctx.readOnlyGuard,
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

	updateSlug: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			return await updateOrganizationUrlSlug(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					administration: createSupabaseOrgSettingsAdministrationPort(locals)
				},
				{
					urlSlug: (formData.get('urlSlug') as string) ?? ''
				}
			);
		} catch (error) {
			return toActionFailure('slugError', error);
		}
	},

	clearSlug: async (event) => {
		const { locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		try {
			const ctx = await buildRouteContext(event);
			return await clearOrganizationUrlSlug({
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				readOnlyGuard: ctx.readOnlyGuard,
				administration: createSupabaseOrgSettingsAdministrationPort(locals)
			});
		} catch (error) {
			return toActionFailure('slugError', error);
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
					readOnlyGuard: ctx.readOnlyGuard,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{
					email: (formData.get('email') as string) ?? '',
					preset: (formData.get('preset') as string) ?? '',
					scopedGroupId: ((formData.get('scopedGroupId') as string) || null) ?? null,
					capabilityOverrides: parseCapabilityOverrides(formData),
					accessScopeKind: (formData.get('accessScopeKind') as 'organization' | 'groups' | null) ?? null,
					accessScopeGroupIds: formData.getAll('accessScopeGroupIds').map(String),
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
					readOnlyGuard: ctx.readOnlyGuard,
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
					readOnlyGuard: ctx.readOnlyGuard,
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
					readOnlyGuard: ctx.readOnlyGuard,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals)
				},
				{
					membershipId: (formData.get('membershipId') as string) ?? '',
					preset: (formData.get('preset') as string) ?? '',
					scopedGroupId: ((formData.get('scopedGroupId') as string) || null) ?? null,
					customPermissions: parseCustomPermissions(formData),
					capabilityOverrides: parseCapabilityOverrides(formData),
					accessScopeKind: (formData.get('accessScopeKind') as 'organization' | 'groups' | null) ?? null,
					accessScopeGroupIds: formData.getAll('accessScopeGroupIds').map(String),
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
					readOnlyGuard: ctx.readOnlyGuard,
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
					readOnlyGuard: ctx.readOnlyGuard,
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
		canManageMembers: formData.get('canManageMembers') === 'on'
	};
}

function toAccessPresentationRow(row: Record<string, unknown>) {
	return {
		scoped_group_id: row.scoped_group_id as string | null,
		can_view_calendar: row.can_view_calendar as boolean,
		can_edit_calendar: row.can_edit_calendar as boolean,
		can_view_personnel: row.can_view_personnel as boolean,
		can_edit_personnel: row.can_edit_personnel as boolean,
		can_view_training: row.can_view_training as boolean,
		can_edit_training: row.can_edit_training as boolean,
		can_view_critical_tasks: row.can_view_critical_tasks as boolean | null | undefined,
		can_edit_critical_tasks: row.can_edit_critical_tasks as boolean | null | undefined,
		can_view_onboarding: row.can_view_onboarding as boolean,
		can_edit_onboarding: row.can_edit_onboarding as boolean,
		can_view_rating_scheme: row.can_view_rating_scheme as boolean | null | undefined,
		can_edit_rating_scheme: row.can_edit_rating_scheme as boolean | null | undefined,
		can_manage_members: row.can_manage_members as boolean,
		member_preset: row.member_preset,
		capability_overrides: row.capability_overrides,
		access_scope_kind: row.access_scope_kind,
		access_scope_group_ids: row.access_scope_group_ids
	};
}

function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { [errorKey]: error.message });
	}

	throw error;
}
