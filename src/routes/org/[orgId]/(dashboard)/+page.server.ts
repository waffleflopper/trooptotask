import type { PageServerLoadEvent } from './$types';
import { buildLayoutContext, loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import { fetchDashboardTrainingSummary } from '$lib/server/core/useCases/trainingSummaryQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';
import { withDashboardTiming } from '$lib/server/utils/dashboardTiming';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchDashboardTrainingSummary>>['trainingSummary'];
	onboardingTrainingCompletions: string[];
}

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;
	const parentDataPromise = parent();
	const ctx = await buildLayoutContext(locals, cookies, orgId);
	const { data: summary } = loadWithContextCore(ctx, {
		permission: 'none',
		defer: true,
		fn: async () =>
			withDashboardTiming(orgId, 'summary', async () => {
				const parentData = await parentDataPromise;
				const workspaceBootstrap = parentData.dashboard.data as Promise<WorkspaceBootstrap<DashboardBootstrap>>;
				const workspaceData = (await workspaceBootstrap).data;
				const trainingData = await fetchDashboardTrainingSummary(ctx, {
					personnel: workspaceData.personnel,
					trainingTypes: workspaceData.trainingTypes,
					onboardingPersonnelIds: workspaceData.activeOnboardings.map((o) => o.personnelId),
					options: {
						// Fetch enough to guarantee 5 unique people after client-side deduplication
						issueLimit: 25,
						issueStatuses: ['expired', 'warning-orange']
					}
				});

				return {
					trainingSummary: trainingData.trainingSummary,
					onboardingTrainingCompletions: [...trainingData.onboardingTrainingCompletions]
				} satisfies DashboardPageSummaryData;
			})
	});

	return {
		summary
	};
};
