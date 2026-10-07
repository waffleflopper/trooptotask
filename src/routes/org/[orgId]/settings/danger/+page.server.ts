import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteRequest, createRequestSensitiveActionContext } from '$lib/server/adapters/requestContexts.server';
import { createSupabaseAuditAdapter, getRequestInfo } from '$lib/audit/index.server';
import {
	createSupabaseOrganizationOwnershipTransferPort,
	createSupabaseOrganizationDestructionPort,
	deleteOrganization,
	transferOrganizationOwnership
} from '$features/organization/index.server';
import { toActionFailure } from '$lib/server/adapters/httpAdapter';
import { loadDangerSettings } from '$features/organization/index.server';
import { loadSettingsPage } from '../settingsLoad.server';
import {
	createSettingsDangerContext,
	createSettingsSensitiveNotificationContext
} from '../settingsRequestContexts.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsDangerContext, async (ctx, { common, organization }) => {
		const dangerSettings = await loadDangerSettings(ctx, {
			isAdmin: common.isAdmin,
			organization
		});

		if (!dangerSettings.currentMember.isOwner) {
			redirect(303, `/org/${common.orgUrlSegment}/settings/general`);
		}

		return { dangerSettings };
	});

export const actions: Actions = {
	transferOwnership: async (event) => {
		const { request, locals } = event;
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const newOwnerIdRaw = formData.get('newOwnerId');
		const confirmTransferEmailRaw = formData.get('confirmTransferEmail');
		try {
			const ctx = createSettingsSensitiveNotificationContext(await buildRouteRequest(event));
			return await transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,
					administration: createSupabaseOrganizationOwnershipTransferPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					newOwnerId: typeof newOwnerIdRaw === 'string' ? newOwnerIdRaw : '',
					confirmTransferEmail: typeof confirmTransferEmailRaw === 'string' ? confirmTransferEmailRaw : ''
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
		const confirmNameRaw = formData.get('confirmName');
		try {
			const ctx = createRequestSensitiveActionContext(await buildRouteRequest(event));
			await deleteOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					deletedAudit: createSupabaseAuditAdapter(null, getRequestInfo(event)),
					destruction: createSupabaseOrganizationDestructionPort(locals),
					sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer
				},
				{
					confirmName: typeof confirmNameRaw === 'string' ? confirmNameRaw : ''
				}
			);
		} catch (error) {
			return toActionFailure('deleteError', error);
		}

		throw redirect(303, '/dashboard?show=all');
	}
};
