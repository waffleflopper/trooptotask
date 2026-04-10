import type { PageServerLoadEvent } from './$types';
import { buildLayoutContext, loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import { fetchDashboardTrainingSummary } from '$lib/server/core/useCases/trainingSummaryQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchDashboardTrainingSummary>>['trainingSummary'];
	onboardingTrainingCompletions: string[];
}

function getNowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function withDashboardTiming<T>(orgId: string, phase: 'summary', run: () => Promise<T>): Promise<T> {
	const startedAt = getNowMs();

	try {
		const result = await run();
		console.info('[dashboard-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'ok'
		});
		return result;
	} catch (error) {
		console.info('[dashboard-load]', {
			orgId,
			phase,
			durationMs: Math.round(getNowMs() - startedAt),
			status: 'error'
		});
		throw error;
	}
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
						issueLimit: 5,
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
