import type { PageServerLoadEvent } from './$types';
import { buildLayoutContext, loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import { fetchDashboardTrainingSummary } from '$lib/server/core/useCases/trainingSummaryQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchDashboardTrainingSummary>>['trainingSummary'];
	onboardingTrainingCompletions: string[];
}

export interface DashboardPageSupportData {
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
}

function getNowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

async function withDashboardTiming<T>(orgId: string, phase: 'summary' | 'support', run: () => Promise<T>): Promise<T> {
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

	const { data: support } = loadWithContextCore(ctx, {
		permission: 'none',
		defer: true,
		fn: async () =>
			withDashboardTiming(orgId, 'support', async () => {
				const [onboardingTemplateStepCount, ratingSchemeEntryCount, orgMemberCount, gettingStartedRows] =
					await Promise.all([
						ctx.store.findManyWithCount('onboarding_template_steps', ctx.auth.orgId),
						ctx.store.findManyWithCount('rating_scheme_entries', ctx.auth.orgId),
						ctx.store.findManyWithCount('organization_memberships', ctx.auth.orgId),
						ctx.auth.userId
							? ctx.store.findMany<Record<string, unknown>>('getting_started_progress', ctx.auth.orgId, {
									user_id: ctx.auth.userId
								})
							: Promise.resolve([])
					]);

				const gettingStartedData = gettingStartedRows.length > 0 ? gettingStartedRows[0] : null;

				return {
					onboardingTemplateStepCount: onboardingTemplateStepCount.count ?? 0,
					ratingSchemeEntryCount: ratingSchemeEntryCount.count ?? 0,
					orgMemberCount: orgMemberCount.count ?? 0,
					gettingStartedDismissed: (gettingStartedData as Record<string, unknown> | null)?.dismissed_at != null
				} satisfies DashboardPageSupportData;
			})
	});

	return {
		summary,
		support
	};
};
