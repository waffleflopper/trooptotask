import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { buildRouteContext, loadWithContext } from '$lib/server/adapters/httpAdapter';
import { getSettingsPermissions } from '../settingsPermissions.server';
import { createSupabaseOrgSettingsAdministrationPort } from '$lib/server/adapters/supabaseOrgSettingsAdministration';
import {
	deleteOrganization as deleteOrganizationUseCase,
	transferOrganizationOwnership
} from '$lib/server/core/useCases/orgSettingsAdministration';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadDangerSettings } from './dangerSettings.server';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
	const parentData = await parent();
	const permissions = getSettingsPermissions(parentData);
	if (!permissions) return {} as never;

	const { orgId, orgName, orgUrlSegment, allOrgs, isAdmin, effectiveTier } = parentData;

	return loadWithContext(locals, cookies, orgId, {
		policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
		policyResource: { kind: 'organization' },
		fn: async (ctx) => {
			const dangerSettings = await loadDangerSettings(ctx, {
				isAdmin: Boolean(isAdmin),
				organization: {
					id: orgId,
					name: orgName,
					urlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
					urlSegment: orgUrlSegment ?? orgId,
					effectiveTier: effectiveTier ?? null
				}
			});

			if (!dangerSettings.currentMember.isOwner) {
				redirect(303, `/org/${orgUrlSegment ?? orgId}/settings/general`);
			}

			return {
				orgId,
				orgUrlSegment: orgUrlSegment ?? orgId,
				orgUrlSlug: orgUrlSegment && orgUrlSegment !== orgId ? orgUrlSegment : null,
				orgName,
				effectiveTier,
				permissions,
				allOrgs,
				dangerSettings
			};
		}
	});
};

export const actions: Actions = {
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
