import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoadEvent } from './$types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	buildLayoutContext,
	buildRouteContext,
	loadWithContextCore,
	rethrowOrWrap
} from '$lib/server/adapters/httpAdapter';
import { createSupabaseOrgSettingsMemberManagementPort, leaveOrganization } from '$features/organization/index.server';
import { fetchDashboardSummary, withDashboardTiming } from '$features/dashboard/index.server';
import type { DashboardWorkspaceResult } from '$features/dashboard/contracts';

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;
	const parentData = await parent();
	const ctx = await buildLayoutContext(locals, cookies, orgId);
	const { data: summary } = loadWithContextCore(ctx, {
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		defer: true,
		fn: async () =>
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
	});

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
			const ctx = await buildRouteContext(event);
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
