import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseMemberAccessEditFormData } from '$lib/access/memberAccessCommands';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { getAdminClient } from '$lib/server/supabase';
import { createSupabaseOrganizationInvitationDeliveryPort } from '$lib/server/organizationInvitationDelivery';
import { createSupabaseOrganizationInvitationRateLimiter } from '$lib/server/organizationInvitationRateLimit';
import { fetchAuditLogPreview } from '$lib/server/core/useCases/auditLogQuery';
import type { UseCaseContext } from '$lib/server/core/ports';
import { readEffectivePlanPolicy } from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import {
	deleteOrganization as deleteOrganizationUseCase,
	transferOrganizationOwnership
} from '$lib/server/core/useCases/orgSettingsAdministration';
import {
	inviteOrganizationMember,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { buildPlanUsageSummary, type PlanUsageSummary } from '$lib/server/core/useCases/planUsageSummary';
import {
	loadOrganizationSettingsWorkspace,
	type SettingsExportInfoSource
} from './organizationSettingsWorkspace.server';
import { toActionFailure } from './settingsActionFailure.server';

export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();
	redirect(303, `/org/${parentData.orgUrlSegment ?? parentData.orgId}/settings/general`);
};

export const loadSettingsWorkspacePage = async ({ locals, cookies, parent }: Parameters<PageServerLoad>[0]) => {
	const parentData = await parent();
	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;
	const permissions = parentData.permissions!;

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => {
			const adminStore = createSupabaseDataStore(getAdminClient());
			const planInfo = loadPlanInfo(ctx);
			const workspace = await loadOrganizationSettingsWorkspace(ctx, {
				isAdmin: Boolean(isAdmin),
				organization: {
					id: orgId,
					name: orgName,
					urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
					urlSegment: orgUrlSegment ?? orgId,
					effectiveTier: effectiveTier ?? null
				},
				exportInfo: planInfo.then((info) => info.exportInfo),
				auditLog: fetchAuditLogPreview(ctx, adminStore, { limit: 9 })
			});
			const { planUsageSummary } = await planInfo;

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				planUsageSummary,
				workspace
			};
		}
	});
};

async function loadPlanInfo(ctx: Pick<UseCaseContext, 'auth' | 'rawStore'>): Promise<{
	exportInfo: SettingsExportInfoSource;
	planUsageSummary: PlanUsageSummary;
}> {
	const [policy, usage] = await Promise.all([
		readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore }),
		readOrganizationPlanUsage({ auth: ctx.auth, store: ctx.rawStore })
	]);
	const exportLimit = policy.exportQuota.limit;
	return {
		exportInfo: {
			exportsUsed: usage.monthlyExportCount,
			exportsLimit: exportLimit ?? Infinity,
			isLimited: exportLimit !== null
		},
		planUsageSummary: buildPlanUsageSummary(policy, usage)
	};
}

export const actions: Actions = {
	invite: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			const origin = event.url?.origin ?? new URL(request.url).origin;
			const accessCommand = parseMemberAccessEditFormData(formData);
			return await inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					store: ctx.rawStore,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals),
					invitationDelivery: createSupabaseOrganizationInvitationDeliveryPort(getAdminClient()),
					invitationRateLimiter: createSupabaseOrganizationInvitationRateLimiter(getAdminClient()),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					email: (formData.get('email') as string) ?? '',
					membershipRole: accessCommand.membershipRole,
					memberAccess: accessCommand.memberAccess,
					actorEmail: user.email,
					origin
				}
			);
		} catch (error) {
			return toActionFailure('inviteError', error);
		}
	},

	resendInvite: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			const origin = event.url?.origin ?? new URL(request.url).origin;
			return await resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals),
					invitationDelivery: createSupabaseOrganizationInvitationDeliveryPort(getAdminClient()),
					invitationRateLimiter: createSupabaseOrganizationInvitationRateLimiter(getAdminClient())
				},
				{
					inviteId: (formData.get('inviteId') as string) ?? '',
					actorEmail: user.email,
					origin
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
					settings: createSupabaseOrgSettingsMemberManagementPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
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
			const accessCommand = parseMemberAccessEditFormData(formData);
			return await updateOrganizationMemberPermissions(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					readOnlyGuard: ctx.readOnlyGuard,
					settings: createSupabaseOrgSettingsMemberManagementPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					membershipId: (formData.get('membershipId') as string) ?? '',
					membershipRole: accessCommand.membershipRole,
					memberAccess: accessCommand.memberAccess,
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
					administration: createSupabaseOrgSettingsAdministrationPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					newOwnerId: (formData.get('newOwnerId') as string) ?? '',
					confirmTransferEmail: (formData.get('confirmTransferEmail') as string) ?? ''
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
					administration: createSupabaseOrgSettingsAdministrationPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
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
