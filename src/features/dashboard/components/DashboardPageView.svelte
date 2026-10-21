<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { AttentionActionRowSkeleton } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDashboardTitleDate, type DashboardViewerDay } from '../contracts';
	import { openCalendarAt } from '../calendarLink';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import {
		composeDashboardSections,
		type DashboardAccess,
		type DashboardSection,
		type QuickAddEntry
	} from '../sections/dashboardSections';
	import BottomLine from './BottomLine.svelte';
	import ForecastLanes from './ForecastLanes.svelte';
	import GroupStrength from './GroupStrength.svelte';
	import NeedsYouQueue from './NeedsYouQueue.svelte';
	import StrengthForecast from './StrengthForecast.svelte';
	import OverviewTab from './tabs/OverviewTab.svelte';

	interface Props {
		orgName: string;
		viewerDay: DashboardViewerDay;
		/** Null until the workspace and summary have both arrived. */
		ctx: DashboardScreenModel | null;
		/** Every section the page can show; those whose feature is off add nothing. */
		sections: readonly DashboardSection[];
		access: DashboardAccess;
		/** Replaces the bands when a source fails; the header stays. */
		failure?: Snippet;
	}

	let { orgName, viewerDay, ctx, sections, access, failure }: Props = $props();

	const ready = $derived(ctx !== null && !ctx.isHydrating);
	const model = $derived(ready ? ctx : null);
	const eyebrow = $derived(
		model ? `Dashboard · ${orgName} · ${model.totalPersonnel} personnel` : `Dashboard · ${orgName}`
	);
	const parts = $derived(
		model ? composeDashboardSections(sections, model.inputs, model.data.disabledFeatures, access) : null
	);
	const quickAdd = $derived(parts?.quickAdd ?? []);

	let openQuickAdd = $state<QuickAddEntry | null>(null);

	const EYEBROW = 'font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase';
	const BAND = 'grid gap-14 border-t-2 border-foreground pt-6';
</script>

<svelte:head>
	<title>{orgName} — Dashboard — Troop to Task</title>
</svelte:head>

{#snippet quickAddButtons()}
	<div class="flex flex-wrap items-center gap-2 pb-1" role="group" aria-labelledby="dashboard-quick-add">
		<span id="dashboard-quick-add" class="pr-1.5 {EYEBROW}">Quick add</span>
		{#each quickAdd as entry, index (entry.id)}
			<Button variant={index === quickAdd.length - 1 ? 'default' : 'outline'} onclick={() => (openQuickAdd = entry)}>
				{entry.label}
			</Button>
		{/each}
	</div>
{/snippet}

<div class="flex h-full flex-col">
	<div class="flex-1 overflow-y-auto">
		<div class="px-4 pt-6 pb-5 sm:px-9 sm:pt-8">
			<PageShell.Header
				variant="display"
				{eyebrow}
				title={formatDashboardTitleDate(viewerDay.date)}
				aside={quickAdd.length > 0 ? quickAddButtons : undefined}
			/>
		</div>

		<div class="grid gap-11 px-4 pt-2 pb-12 sm:px-9">
			{#if failure}
				{@render failure()}
			{:else}
				{#if !model}
					<p class="sr-only" role="status">Loading Dashboard</p>
				{/if}

				<section
					class="{BAND} lg:grid-cols-[400px_minmax(0,1fr)]"
					aria-label="Strength"
					aria-busy={!model}
					data-dashboard-band="strength"
				>
					<div class="grid min-w-0 content-start gap-[18px]">
						<h2 class={EYEBROW}>Bottom line · Today</h2>
						{#if model}
							<BottomLine line={model.strength.bottomLine} statusById={model.strength.statusById} />
						{:else}
							<div class="grid gap-[18px]" aria-hidden="true">
								<div class="flex items-end gap-4">
									<Skeleton class="h-24 w-28" />
									<div class="grid gap-2 pb-1">
										<Skeleton class="h-7 w-16" />
										<Skeleton class="h-3 w-28" />
									</div>
								</div>
								<Skeleton class="h-5 w-full" />
								<div class="grid">
									{#each { length: 4 }, index (index)}
										<div class="flex h-9 items-center gap-2.5 border-b border-border">
											<Skeleton class="size-2.5" />
											<Skeleton class="h-3.5 w-16" />
											<Skeleton class="h-3.5 flex-1" />
											<Skeleton class="h-3 w-20" />
										</div>
									{/each}
								</div>
								<Skeleton class="h-4 w-[80%]" />
							</div>
						{/if}
					</div>
					<div class="grid min-w-0 content-start gap-[18px]">
						<h2 class={EYEBROW}>Available · next 14 days</h2>
						{#if model && parts}
							<StrengthForecast
								band={model.strength}
								today={model.today}
								calendarHref="/org/{model.data.orgId}/calendar"
								onOpenCalendar={() => openCalendarAt(model.today)}
							>
								{#snippet lanes()}
									<ForecastLanes days={model.forecastDays} lanes={parts.forecastLanes} />
								{/snippet}
							</StrengthForecast>
							<GroupStrength groups={model.strength.groups} mode={model.strength.bottomLine.mode} />
						{:else}
							<div class="grid gap-[18px]" aria-hidden="true">
								<Skeleton class="h-7 w-[60%]" />
								<div class="grid grid-cols-14 items-end gap-1.5 border-b border-border">
									{#each { length: 14 }, index (index)}
										<div class="grid gap-1.5 px-1.5 pt-2">
											<Skeleton class="mx-auto h-5 w-5" />
											<Skeleton class="h-[131px] w-full rounded-[1px]" />
										</div>
									{/each}
								</div>
								<div class="grid grid-cols-4 gap-4 border-t border-border pt-3.5">
									{#each { length: 4 }, index (index)}
										<Skeleton class="h-4 w-20" />
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>

				<section
					class="{BAND} lg:grid-cols-[minmax(0,1fr)_340px]"
					aria-label="Action"
					aria-busy={!model}
					data-dashboard-band="action"
				>
					<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
						<PageShell.SectionHeader
							size="compact"
							eyebrow={parts ? `Needs you · ${parts.needsYou.ranked.length}` : 'Needs you'}
							title="Most urgent first"
						>
							{#snippet action()}
								<p class="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">Act here, or open the page</p>
							{/snippet}
						</PageShell.SectionHeader>
						{#if parts}
							<NeedsYouQueue queue={parts.needsYou} />
						{:else}
							<div class="grid border-t border-foreground" aria-hidden="true">
								{#each { length: 5 }, index (index)}
									<AttentionActionRowSkeleton />
								{/each}
							</div>
						{/if}
					</div>
					<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
						<PageShell.SectionHeader size="compact" eyebrow="On duty" title="Tonight and tomorrow" />
						{#if model && parts}
							{#each parts.onDutyBlocks as block (block.id)}
								<block.component {model} />
							{/each}
						{:else}
							<div class="grid gap-[18px]" aria-hidden="true">
								<div class="grid border-t border-border">
									{#each { length: 3 }, index (index)}
										<div class="flex h-11 items-center gap-3 border-b border-border">
											<Skeleton class="h-3 flex-1" />
											<Skeleton class="h-3.5 w-24" />
											<Skeleton class="h-3.5 w-24" />
										</div>
									{/each}
								</div>
								<div class="grid border-t border-border">
									{#each { length: 4 }, index (index)}
										<div class="flex h-[38px] items-center gap-2.5 border-b border-border">
											<Skeleton class="h-3 w-12" />
											<Skeleton class="h-3.5 flex-1" />
											<Skeleton class="h-3.5 w-16" />
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</section>

				<section class="{BAND} gap-5" aria-label="Readiness" aria-busy={!model} data-dashboard-band="readiness">
					<PageShell.SectionHeader size="compact" eyebrow="Readiness · as of today" title="Where the unit stands" />
					{#if model && parts}
						{#if parts.readinessColumns.length > 0}
							<div class="grid gap-6 lg:auto-cols-fr lg:grid-flow-col lg:gap-0">
								{#each parts.readinessColumns as column (column.id)}
									<div class="min-w-0 lg:border-l lg:border-border lg:px-7 lg:first:border-l-0 lg:first:pl-0">
										<column.component {model} />
									</div>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="grid gap-6 lg:grid-cols-4 lg:gap-0" aria-hidden="true">
							{#each { length: 4 }, index (index)}
								<div class="grid gap-3 lg:border-l lg:border-border lg:px-7 lg:first:border-l-0 lg:first:pl-0">
									<Skeleton class="h-3 w-24" />
									<Skeleton class="h-12 w-20" />
									<Skeleton class="h-2 w-full" />
									<Skeleton class="h-3.5 w-[80%]" />
								</div>
							{/each}
						</div>
					{/if}
				</section>

				{#if model}
					<OverviewTab ctx={model} />
				{/if}
			{/if}
		</div>
	</div>
</div>

{#if openQuickAdd && model}
	<openQuickAdd.dialog {model} onClose={() => (openQuickAdd = null)} />
{/if}
