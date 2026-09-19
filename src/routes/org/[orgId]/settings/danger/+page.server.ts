import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import {
	deleteOrganization as deleteOrganizationUseCase,
	transferOrganizationOwnership
} from '$lib/server/core/useCases/orgSettingsAdministration';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadDangerSettings } from './dangerSettings.server';
import { loadSettingsPage } from '../settingsLoad.server';

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx, { common, organization }) => {
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
			const ctx = await buildRouteContext(event);
			return await transferOrganizationOwnership(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

					administration: createSupabaseOrgSettingsAdministrationPort(locals),
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
			const ctx = await buildRouteContext(event);
			await deleteOrganizationUseCase(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

					administration: createSupabaseOrgSettingsAdministrationPort(locals),
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
