import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createSupabaseAuditAdapter } from '$lib/audit/index.server';
import { createRequestNotificationDelivery } from '$lib/server/adapters/requestContexts.server';
import { toActionFailure } from '$lib/server/adapters/httpAdapter';
import {
	acceptDashboardInvitation,
	createSupabaseDashboardOrgAccessPort,
	declineDashboardInvitation,
	loadDashboardOrgAccess,
	readLastOrganizationId,
	LAST_ORGANIZATION_COOKIE
} from '$features/organization/index.server';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const result = await loadDashboardOrgAccess(createSupabaseDashboardOrgAccessPort(locals), {
		userId: user.id,
		email: user.email,
		forceShow: url.searchParams.get('show') === 'all',
		lastOrganizationId: readLastOrganizationId(cookies.get(LAST_ORGANIZATION_COOKIE), user.id)
	});

	if (result.landing.kind === 'redirect') {
		throw redirect(303, result.landing.to);
	}

	return {
		userEmail: user.email ?? null,
		noOrganization: result.landing.kind === 'no-organization',
		organizations: result.organizations,
		pendingInvitations: result.pendingInvitations
	};
};

export const actions: Actions = {
	acceptInvitation: async ({ request, locals, getClientAddress }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Invitation ID required' });
		}

		try {
			return await acceptDashboardInvitation(
				{
					dashboard: createSupabaseDashboardOrgAccessPort(locals),
					notifications: createRequestNotificationDelivery(),
					audit: (organizationId) =>
						createSupabaseAuditAdapter(organizationId, {
							userId: user.id,
							userEmail: user.email ?? null,
							ip: getClientAddress(),
							userAgent: request.headers.get('user-agent') ?? ''
						})
				},
				{
					invitationId,
					userId: user.id,
					email: user.email
				}
			);
		} catch (error) {
			return toActionFailure('error', error);
		}
	},

	declineInvitation: async ({ request, locals, getClientAddress }) => {
		const user = locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const invitationId = formData.get('invitationId') as string;

		if (!invitationId) {
			return fail(400, { error: 'Invitation ID required' });
		}

		try {
			return await declineDashboardInvitation(
				{
					dashboard: createSupabaseDashboardOrgAccessPort(locals),
					notifications: createRequestNotificationDelivery(),
					audit: (organizationId) =>
						createSupabaseAuditAdapter(organizationId, {
							userId: user.id,
							userEmail: user.email ?? null,
							ip: getClientAddress(),
							userAgent: request.headers.get('user-agent') ?? ''
						})
				},
				{
					invitationId,
					userId: user.id,
					email: user.email
				}
			);
		} catch (error) {
			return toActionFailure('error', error);
		}
	}
};
