import {
	formatDashboardDisplayDate,
	type DashboardViewerDay,
	type DashboardWorkspaceResult
} from '$features/dashboard/contracts';
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
import { viewerTimeZone, viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoadEvent } from './$types';

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data', VIEWER_DAY_DEPENDENCY);
	const { orgId } = params;
	const parentData = await parent();
	const asOf = viewerToday(cookies);
	const timeZone = viewerTimeZone(cookies);
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
					return fetchDashboardSummary(ctx, workspaceData, asOf, timeZone);
				})
		},
		() => createRequestDashboardSummaryContext(ctx)
	);

	return {
		summary,
		breadcrumbLabel: formatDashboardDisplayDate(asOf),
		viewerDay: { date: asOf, timeZone } satisfies DashboardViewerDay
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
