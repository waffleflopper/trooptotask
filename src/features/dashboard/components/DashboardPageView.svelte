<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import OverviewTab from './tabs/OverviewTab.svelte';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';

	let { ctx }: { ctx: DashboardScreenModel } = $props();
</script>

<svelte:head>
	<title>{ctx.data.orgName} — Dashboard — Troop to Task</title>
</svelte:head>

<div class="flex h-full flex-col">
	<main class="flex-1 overflow-y-auto p-6 max-sm:p-2" id="main-content">
		{#if ctx.isHydrating}
			<div class="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite" role="status">
				<div class="grid gap-3 lg:grid-cols-3">
					<Skeleton data-testid="skeleton-block" class="h-40" />
					<Skeleton data-testid="skeleton-block" class="h-40" />
					<Skeleton data-testid="skeleton-block" class="h-40" />
				</div>
				<div class="grid gap-3 md:grid-cols-2">
					<Skeleton data-testid="skeleton-block" class="h-55" />
					<Skeleton data-testid="skeleton-block" class="h-55" />
				</div>
			</div>
		{:else}
			<OverviewTab {ctx} />
		{/if}
	</main>
</div>
