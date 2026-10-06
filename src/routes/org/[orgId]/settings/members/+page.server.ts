import { readPendingDeletionRequestSummary } from '$features/deletion-requests/index.server';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseMemberAccessEditFormData } from '$lib/access/memberAccessCommands';
import { createRequestDeletionRequestStore } from '$lib/server/adapters/httpAdapter';
import { buildRouteRequest, createRequestNotificationContext } from '$lib/server/adapters/requestContexts.server';
import { createSupabaseAccountSetupLinkIssuancePorts } from '$features/identity/index.server';
import { getAdminClient } from '$lib/server/supabase';
import { listGroupCatalog } from '$features/personnel/index.server';
import {
	createSupabaseOrgSettingsMemberManagementPort,
	createSupabaseOrganizationInvitationDeliveryPort,
	createSupabaseOrganizationInvitationRateLimiter,
	loadMembersSettings,
	inviteOrganizationMember,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberAccess
} from '$features/organization/index.server';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadSettingsPage } from '../settingsLoad.server';
import {
	createSettingsMembersContext,
	createSettingsSensitiveNotificationContext
} from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsMembersContext, async (ctx, { common }) => ({
		membersSettings: await loadMembersSettings(ctx, {
			isAdmin: common.isAdmin,
			groups: listGroupCatalog(ctx),
			pendingApprovalSummary: readPendingDeletionRequestSummary({
				auth: ctx.auth,
				audit: ctx.audit,
				store: createRequestDeletionRequestStore(event.locals)
			})
		})
	}));

export const actions: Actions = {
	invite: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = createSettingsSensitiveNotificationContext(await buildRouteRequest(event));
			const origin = event.url?.origin ?? new URL(request.url).origin;
			const accessCommand = parseMemberAccessEditFormData(formData);
			return await inviteOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

					settings: createSupabaseOrgSettingsMemberManagementPort(locals),
					invitationDelivery: createSupabaseOrganizationInvitationDeliveryPort(getAdminClient()),
					invitationRateLimiter: createSupabaseOrganizationInvitationRateLimiter(getAdminClient()),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer,
					...createSupabaseAccountSetupLinkIssuancePorts(getAdminClient())
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
			const ctx = createRequestNotificationContext(await buildRouteRequest(event));
			const origin = event.url?.origin ?? new URL(request.url).origin;
			return await resendOrganizationInvitation(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

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
			const ctx = createRequestNotificationContext(await buildRouteRequest(event));
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
			const ctx = createSettingsSensitiveNotificationContext(await buildRouteRequest(event));
			return await removeOrganizationMember(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

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

	updateMemberAccess: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = createSettingsSensitiveNotificationContext(await buildRouteRequest(event));
			const accessCommand = parseMemberAccessEditFormData(formData);
			return await updateOrganizationMemberAccess(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

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
			return toActionFailure('accessError', error);
		}
	}
};
