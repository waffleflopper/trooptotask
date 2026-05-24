import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseMemberAccessEditFormData } from '$lib/access/memberAccessCommands';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { isBillingEnabled } from '$lib/config/billing';
import { TIER_CONFIG } from '$lib/types/subscription';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { getAdminClient } from '$lib/server/supabase';
import { createSupabaseOrganizationInvitationDeliveryPort } from '$lib/server/organizationInvitationDelivery';
import { createSupabaseOrganizationInvitationRateLimiter } from '$lib/server/organizationInvitationRateLimit';
import { fetchAuditLogPreview } from '$lib/server/core/useCases/auditLogQuery';
import type { SubscriptionPort } from '$lib/server/core/ports';
import {
	clearOrganizationUrlSlug,
	deleteOrganization as deleteOrganizationUseCase,
	renameOrganization,
	transferOrganizationOwnership,
	updateOrganizationUrlSlug
} from '$lib/server/core/useCases/orgSettingsAdministration';
import {
	inviteOrganizationMember,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { requireGovernancePolicy } from '$lib/server/core/useCases/governancePolicy';
import {
	loadOrganizationSettingsWorkspace,
	type SettingsExportInfoSource
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
			const workspace = await loadOrganizationSettingsWorkspace(ctx, {
				isAdmin: Boolean(isAdmin),
				organization: {
					id: orgId,
					name: orgName,
					urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
					urlSegment: orgUrlSegment ?? orgId,
					effectiveTier: effectiveTier ?? null
				},
				exportInfo: loadExportInfo(ctx),
				auditLog: fetchAuditLogPreview(ctx, adminStore, { limit: 9 })
			});

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				workspace
			};
		}
	});
};

async function loadExportInfo(ctx: { subscription: SubscriptionPort }): Promise<SettingsExportInfoSource> {
	if (!isBillingEnabled) {
		return {
			exportsUsed: 0,
			exportsLimit: Infinity,
			isLimited: false
		};
	}

	const [tier, exportCount] = await Promise.all([
		ctx.subscription.getEffectiveTier(),
		ctx.subscription.getMonthlyExportCount()
	]);
	const config = TIER_CONFIG[tier.tier];
	return {
		exportsUsed: exportCount,
		exportsLimit: config.bulkExportsPerMonth,
		isLimited: config.bulkExportsPerMonth !== Infinity
	};
}

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

function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { [errorKey]: error.message });
	}

	throw error;
}
