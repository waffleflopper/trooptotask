import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
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
import type { DeletionRequestRow } from './settingsRows.server';
import {
	buildPendingApprovalSummary,
	loadOrganizationSettingsWorkspace,
	withOrganizationSettingsPendingApprovalSummary
} from './organizationSettingsWorkspace.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		permission: 'privileged',
		fn: async (ctx) => {
			await requireGovernancePolicy(
				{ auth: ctx.auth, audit: ctx.audit },
				POLICY_ACTION_CATALOG.organization.accessGovernance
			);

			const adminStore = createSupabaseDataStore(getAdminClient());
			const [workspace, archivedPersonnelRows, approvalRequests, auditLog] = await Promise.all([
				loadOrganizationSettingsWorkspace(ctx, { isAdmin: Boolean(isAdmin) }),
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
			const pendingApprovalSummary = buildPendingApprovalSummary(approvalRequests);
			const workspaceWithApprovalSummary = withOrganizationSettingsPendingApprovalSummary(
				workspace,
				pendingApprovalSummary
			);

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				workspace: workspaceWithApprovalSummary,
				exportInfo,
				archivedPersonnel,
				approvalRequests,
				pendingApprovalsCount: pendingApprovalSummary.count,
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
		let orgUrlSlug: string;
		try {
			const ctx = await buildRouteContext(event);
			const result = await updateOrganizationUrlSlug(
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
			orgUrlSlug = result.orgUrlSlug;
		} catch (error) {
			return toActionFailure('slugError', error);
		}

		throw redirect(303, `/org/${orgUrlSlug}/settings`);
	},

	clearSlug: async (event) => {
		const { locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		let orgId: string;
		try {
			const ctx = await buildRouteContext(event);
			await clearOrganizationUrlSlug({
				auth: ctx.auth,
				audit: ctx.audit,
				notifications: ctx.notifications,
				readOnlyGuard: ctx.readOnlyGuard,
				administration: createSupabaseOrgSettingsAdministrationPort(locals)
			});
			orgId = ctx.auth.orgId;
		} catch (error) {
			return toActionFailure('slugError', error);
		}

		throw redirect(303, `/org/${orgId}/settings`);
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
					customPermissions: null,
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

function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { [errorKey]: error.message });
	}

	throw error;
}
