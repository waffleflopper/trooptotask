<script lang="ts">
	import { DashboardContext, DashboardPageView, DashboardModals } from '$features/dashboard';
	import type { DashboardPageData } from '$features/dashboard/contexts/DashboardContext.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function toDashboardPageData(data: PageData): DashboardPageData {
		return {
			...data,
			orgId: data.orgId,
			orgName: data.orgName ?? 'Troop to Task',
			userId: data.userId ?? null,
			permissions: data.permissions ?? null,
			dashboard: data.dashboard,
			trainingSummary: data.trainingSummary,
			onboardingTrainingCompletions: data.onboardingTrainingCompletions,
			onboardingTemplateStepCount: data.onboardingTemplateStepCount,
			ratingSchemeEntryCount: data.ratingSchemeEntryCount,
			orgMemberCount: data.orgMemberCount,
			gettingStartedDismissed: data.gettingStartedDismissed
		};
	}

	let ctx = $state(new DashboardContext(toDashboardPageData(data)));

	// Track whether we've auto-shown What's New (must persist across re-renders)
	const hasAutoShownWhatsNew = { value: false };

	$effect.pre(() => {
		ctx = new DashboardContext(toDashboardPageData(data));
	});

	$effect(() => {
		ctx.autoShowWhatsNew(hasAutoShownWhatsNew);
	});
</script>

<DashboardPageView {ctx} />
<DashboardModals {ctx} />
