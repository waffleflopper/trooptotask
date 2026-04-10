import type { PageServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';
import {
	fetchTrainingSummary,
	fetchOnboardingTrainingCompletions
} from '$lib/server/core/useCases/trainingSummaryQuery';
import type { WorkspaceBootstrap } from '$lib/server/core/orgShell';

export interface DashboardPageSummaryData {
	trainingSummary: Awaited<ReturnType<typeof fetchTrainingSummary>>;
	onboardingTrainingCompletions: string[];
	onboardingTemplateStepCount: number;
	ratingSchemeEntryCount: number;
	orgMemberCount: number;
	gettingStartedDismissed: boolean;
}

export const load = async ({ params, locals, cookies, depends, parent }: PageServerLoadEvent) => {
	depends('app:org-core');
	depends('app:dashboard-data');
	const { orgId } = params;

	const parentData = await parent();
	const workspaceBootstrap = parentData.dashboard.data as Promise<WorkspaceBootstrap<DashboardBootstrap>>;
	const { data: summary } = await loadWithContext(locals, cookies, orgId, {
		permission: 'none',
		defer: true,
		fn: async (ctx) => {
			const workspaceData = (await workspaceBootstrap).data;
			const [trainingSummary, onboardingTemplateStepCount, ratingSchemeEntryCount, orgMemberCount, gettingStartedRows] =
				await Promise.all([
					fetchTrainingSummary(ctx, {
						personnel: workspaceData.personnel,
						trainingTypes: workspaceData.trainingTypes,
						options: {
							issueLimit: 5,
							issueStatuses: ['expired', 'warning-orange']
						}
					}),
					ctx.store.findManyWithCount('onboarding_template_steps', ctx.auth.orgId),
					ctx.store.findManyWithCount('rating_scheme_entries', ctx.auth.orgId),
					ctx.store.findManyWithCount('organization_memberships', ctx.auth.orgId),
					ctx.auth.userId
						? ctx.store.findMany<Record<string, unknown>>('getting_started_progress', ctx.auth.orgId, {
								user_id: ctx.auth.userId
							})
						: Promise.resolve([])
				]);

			const onboardingPersonnelIds = workspaceData.activeOnboardings.map((o) => o.personnelId);
			const onboardingTrainingCompletions = await fetchOnboardingTrainingCompletions(ctx, {
				personnelIds: onboardingPersonnelIds
			});

			const gettingStartedData = gettingStartedRows.length > 0 ? gettingStartedRows[0] : null;

			return {
				trainingSummary,
				onboardingTrainingCompletions: [...onboardingTrainingCompletions],
				onboardingTemplateStepCount: onboardingTemplateStepCount.count ?? 0,
				ratingSchemeEntryCount: ratingSchemeEntryCount.count ?? 0,
				orgMemberCount: orgMemberCount.count ?? 0,
				gettingStartedDismissed: (gettingStartedData as Record<string, unknown> | null)?.dismissed_at != null
			} satisfies DashboardPageSummaryData;
		}
	});

	return {
		summary
	};
};
