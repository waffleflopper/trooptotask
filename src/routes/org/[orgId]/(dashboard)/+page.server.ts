import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';
import { fetchDashboardSummary, withDashboardTiming } from '$features/dashboard/index.server';
import { createSupabaseOrgSettingsMemberManagementPort, leaveOrganization } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContextCore, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import {
	buildLayoutRequest,
	buildRouteRequest,
	createRequestDashboardSummaryContext,
	createRequestNotificationContext
} from '$lib/server/adapters/requestContexts.server';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;
	const parentData = await parent();
	const ctx = await buildLayoutRequest(locals, orgId);
	const { data: summary } = loadWithContextCore(
		ctx,
		{
			policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
			defer: true,
			fn: async (ctx) =>
				withDashboardTiming(orgId, 'summary', async () => {
					const workspaceBootstrap = parentData.dashboard.data as Promise<DashboardWorkspaceResult>;
					const workspaceData = (await workspaceBootstrap).data;
					const canViewCriticalTasks =
						parentData.shell.kind === 'ready' && parentData.shell.member.capabilityMap.criticalTasks !== 'none';
					const canViewTraining =
						parentData.shell.kind === 'ready' && parentData.shell.member.capabilityMap.training !== 'none';
					return fetchDashboardSummary(ctx, workspaceData, {
						training: canViewTraining,
						criticalTasks: canViewCriticalTasks
					});
				})
		},
		() => createRequestDashboardSummaryContext(ctx)
	);

	return {
		summary
	};
};

export const actions: Actions = {
	leaveOrganization: async (event) => {
		const user = event.locals.user;
		if (!user) throw redirect(303, '/auth/login');

		const formData = await event.request.formData();
		try {
			const ctx = await createRequestNotificationContext(await buildRouteRequest(event));
			await leaveOrganization(
				{
					auth: ctx.auth,
					audit: ctx.audit,
					notifications: ctx.notifications,

					settings: createSupabaseOrgSettingsMemberManagementPort(event.locals)
				},
				{
					membershipId: (formData.get('membershipId') as string) ?? '',
					confirmation: (formData.get('confirmLeaveOrganization') as string) ?? '',
					actorEmail: user.email
				}
			);
		} catch (error) {
			rethrowOrWrap(error);
		}

		throw redirect(303, '/dashboard?show=all');
	}
};
