<script lang="ts">
	import { DashboardContext, DashboardPageView, DashboardModals } from '$features/dashboard';
	import type { DashboardPageData } from '$features/dashboard/contexts/DashboardContext.svelte';

	let { data } = $props();

	const ctx = new DashboardContext(data as DashboardPageData);

	// Track whether we've auto-shown What's New (must persist across re-renders)
	const hasAutoShownWhatsNew = { value: false };

	$effect(() => {
		ctx.hydrateStores();
	});

	$effect(() => {
		ctx.initBannerFromStorage();
	});

	$effect(() => {
		ctx.autoShowWhatsNew(hasAutoShownWhatsNew);
	});
</script>

<DashboardPageView {ctx} />
<DashboardModals {ctx} />
