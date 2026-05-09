<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { Progress } from '$lib/components/ui/progress';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { UpcomingGroupBy } from '../../read-model/dashboardScreenModel.svelte';
	import UpcomingLossesWidget from '../UpcomingLossesWidget.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.unitReadiness);
	const statusEntries = $derived(view.statusEntries);
</script>

<section class="px-4 pb-12">
	<div class="flex flex-col gap-3 py-8 pb-6">
		<div class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Strength Today</div>
		<div class="flex items-baseline gap-6">
			<div class="flex items-baseline gap-3">
				<span class="text-5xl leading-none font-semibold tracking-tight text-foreground">{ctx.availableCount}</span>
				<span class="text-2xl text-muted-foreground">/ {ctx.totalPersonnel}</span>
			</div>
			<div class="ml-auto text-right">
				<span class="block text-3xl leading-none font-semibold tracking-tight" style:color={view.availColor}>
					{view.availPct}%
				</span>
				<span class="mt-0.5 block font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Available</span>
			</div>
		</div>
		<Progress value={view.availPct} aria-label="Personnel availability" />
		<div class="flex flex-wrap items-center gap-1.5">
			<Badge variant="success">{ctx.availableCount} Present</Badge>
			{#each statusEntries as [statusId, status] (statusId)}
				<CalendarStatusBadge
					statusType={{ id: statusId, name: status.name, color: status.color, textColor: status.textColor }}
				>
					{status.count}
					{status.name}
				</CalendarStatusBadge>
			{/each}
		</div>
	</div>

	<div class="grid gap-6 border-t border-border py-8 md:grid-cols-2 lg:grid-cols-3">
		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Training Currency
			</div>
			<div class="mb-1 text-4xl leading-none font-semibold tracking-tight" style:color={view.trainingColor}>
				{ctx.trainingCurrencyPct}%
			</div>
			<div class="mb-2 text-sm text-muted-foreground">of personnel current</div>
			{#if ctx.trainingStats}
				<div class="font-mono text-xs tracking-[0.08em] uppercase">
					{#if ctx.trainingStats.expired > 0}
						<span class="text-danger">{ctx.trainingStats.expired} expired</span>
					{/if}
					{#if ctx.trainingStats.warningOrange > 0}
						<span class="text-warning-foreground"> · {ctx.trainingStats.warningOrange} expiring</span>
					{/if}
				</div>
			{/if}
		</div>

		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Evaluations
			</div>
			<div class="mt-2 flex items-start gap-6">
				<div class="flex flex-col gap-0.5">
					<span class="text-3xl leading-none font-semibold tracking-tight text-danger">{ctx.ratingStats.overdue}</span>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Overdue</span>
				</div>
				<div class="flex flex-col gap-0.5">
					<span class="text-3xl leading-none font-semibold tracking-tight text-warning-foreground">
						{ctx.ratingStats['due-30']}
					</span>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Due in 30</span>
				</div>
			</div>
		</div>

		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">By Group</div>
			{#each ctx.groupBreakdown as group (group.id)}
				<div class="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-2 py-1">
					<span class="truncate font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{group.name}</span>
					<div class="h-0.5 overflow-hidden bg-muted">
						<div
							class="h-full"
							style:width={`${group.pct}%`}
							style:background={view.availabilityColor(group.pct)}
						></div>
					</div>
					<span class="text-right font-mono text-xs" style:color={view.availabilityColor(group.pct)}>{group.pct}%</span>
				</div>
			{/each}
		</div>
	</div>

	{#if ctx.upcomingChanges.length > 0 || ctx.upcomingLosses.length > 0}
		<div class="forward-looking-grid grid items-start gap-8 border-t border-border py-6 md:grid-cols-2">
			<div class="min-w-0">
				<div class="mb-3 flex items-center gap-3">
					<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
						Upcoming Changes
					</span>
					{#if ctx.upcomingChanges.length > 0}
						<Tabs.Root
							value={view.upcomingChanges.mode}
							onValueChange={(mode) => view.upcomingChanges.setMode(mode as UpcomingGroupBy)}
						>
							<Tabs.List aria-label="Upcoming changes grouping">
								<Tabs.Trigger value="date">Date</Tabs.Trigger>
								<Tabs.Trigger value="group">Group</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
					{/if}
				</div>

				{#if ctx.upcomingChanges.length === 0}
					<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
						No changes in the next 7 days.
					</p>
				{:else if view.upcomingChanges.mode === 'date'}
					{#each ctx.upcomingChanges as change (change.key)}
						<div
							class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-border/60 py-2 first:border-t-0"
						>
							<span class="truncate text-sm text-foreground">{change.personName}</span>
							<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
								{ctx.formatShortDate(change.date)} · {change.direction === 'departing'
									? change.statusName
									: 'Returning'}
							</span>
						</div>
					{/each}
				{:else}
					{#each view.upcomingChanges.byGroup as [groupName, changes], i (groupName)}
						<div
							class={[
								i === 0 ? 'border-t-0 pt-0' : 'border-t pt-3',
								'border-border/60 pb-1 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase'
							]}
						>
							{groupName}
						</div>
						{#each changes as change (change.key)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-border/60 py-2 first:border-t-0"
							>
								<span class="truncate text-sm text-foreground">{change.personName}</span>
								<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
									{ctx.formatShortDate(change.date)} · {change.direction === 'departing'
										? change.statusName
										: 'Returning'}
								</span>
							</div>
						{/each}
					{/each}
				{/if}
			</div>
			<div class="min-w-0">
				<UpcomingLossesWidget losses={ctx.upcomingLosses} formatDate={(d) => ctx.formatShortDate(d)} />
			</div>
		</div>
	{/if}
</section>
