import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { parseMemberAccessEditFormData } from '$lib/access/memberAccessCommands';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsMemberManagementPort } from '$lib/server/adapters/supabaseOrgSettingsMemberManagement';
import { getAdminClient } from '$lib/server/supabase';
import { createSupabaseOrganizationInvitationDeliveryPort } from '$lib/server/organizationInvitationDelivery';
import { createSupabaseOrganizationInvitationRateLimiter } from '$lib/server/organizationInvitationRateLimit';
import {
	inviteOrganizationMember,
	removeOrganizationMember,
	resendOrganizationInvitation,
	revokeOrganizationInvitation,
	updateOrganizationMemberPermissions
} from '$lib/server/core/useCases/orgSettingsMemberManagement';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadMembersSettings } from './membersSettings.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx, { common }) => ({
		membersSettings: await loadMembersSettings(ctx, { isAdmin: common.isAdmin })
	}));

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
	}
};
