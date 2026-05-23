import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createSupabaseAuditAdapter } from '$lib/server/adapters/supabaseAudit';
import { createSupabaseNotificationAdapter } from '$lib/server/adapters/supabaseNotification';
import { createSupabaseDashboardOrgAccessPort } from '$lib/server/adapters/supabaseDashboardOrgAccess';
import {
	acceptDashboardInvitation,
	declineDashboardInvitation,
	loadDashboardOrgAccess
} from '$lib/server/core/useCases/dashboardOrgAccess';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) throw redirect(303, '/auth/login');

	const result = await loadDashboardOrgAccess(createSupabaseDashboardOrgAccessPort(locals), {
		userId: user.id,
		email: user.email,
		forceShow: url.searchParams.get('show') === 'all'
	});

	if (result.redirectTo) {
		throw redirect(303, result.redirectTo);
	}

	return {
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
					notifications: createSupabaseNotificationAdapter(),
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
			return toActionFailure(error);
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
					notifications: createSupabaseNotificationAdapter(),
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
			return toActionFailure(error);
		}
	}
};

function toActionFailure(error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		return fail(Reflect.get(error, 'status') as number, { error: error.message });
	}

	throw error;
}
