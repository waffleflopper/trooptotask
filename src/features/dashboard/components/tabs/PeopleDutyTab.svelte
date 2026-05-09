<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';
	import type { OutTodayGroupBy, UpcomingGroupBy } from '../../read-model/dashboardScreenModel.svelte';
	import UpcomingLossesWidget from '../UpcomingLossesWidget.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.peopleDuty);
	const today = $derived(view.today);
	const tomorrow = $derived(view.tomorrow);
</script>

<section class="px-4 pb-12">
	<div class="grid items-start gap-8 py-6 md:grid-cols-2">
		<div class="flex flex-col">
			<div class="mb-3 flex items-center gap-3">
				<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Out Today</span>
				{#if ctx.nonAvailablePersonnel.length > 0}
					<Badge variant="secondary">{ctx.nonAvailablePersonnel.length}</Badge>
					<Tabs.Root
						value={view.outToday.mode}
						onValueChange={(mode) => view.outToday.setMode(mode as OutTodayGroupBy)}
					>
						<Tabs.List aria-label="Out today grouping">
							<Tabs.Trigger value="status">Status</Tabs.Trigger>
							<Tabs.Trigger value="group">Group</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>
				{/if}
			</div>

			{#if ctx.nonAvailablePersonnel.length === 0}
				<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
					All personnel accounted for.
				</p>
			{:else if view.outToday.mode === 'status'}
				<div class="flex flex-col">
					{#each view.outToday.byStatus as [statusName, people], i (statusName)}
						<div
							class={[
								i === 0 ? 'border-t-0 pt-0' : 'border-t pt-3',
								'border-border/60 pb-1 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase'
							]}
						>
							{statusName}
						</div>
						{#each people as person (person.id)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 py-2 first:border-t-0"
							>
								<div class="flex min-w-0 items-baseline gap-1">
									<span class="shrink-0 font-mono text-xs text-muted-foreground uppercase">{person.rank}</span>
									<span class="truncate text-sm text-foreground">{person.personName.replace(/^[A-Z0-9]+ /, '')}</span>
								</div>
							</div>
						{/each}
					{/each}
				</div>
			{:else}
				<div class="flex flex-col">
					{#each view.outToday.byGroup as [groupName, people], i (groupName)}
						<div
							class={[
								i === 0 ? 'border-t-0 pt-0' : 'border-t pt-3',
								'border-border/60 pb-1 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase'
							]}
						>
							{groupName}
						</div>
						{#each people as person (person.id)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border/60 py-2 first:border-t-0"
							>
								<div class="flex min-w-0 items-baseline gap-1">
									<span class="shrink-0 font-mono text-xs text-muted-foreground uppercase">{person.rank}</span>
									<span class="truncate text-sm text-foreground">{person.personName.replace(/^[A-Z0-9]+ /, '')}</span>
								</div>
								<CalendarStatusBadge
									statusType={{
										id: person.statusTypeId,
										name: person.statusName,
										color: person.statusColor,
										textColor: person.statusTextColor
									}}
								>
									{person.statusName}
								</CalendarStatusBadge>
							</div>
						{/each}
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Duty Roster
			</div>

			{#if today}
				<div class="mb-4">
					<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Today</div>
					{#if today.assignments.length === 0}
						<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							No assignments today.
						</p>
					{:else}
						{#each today.assignments as a (a.id)}
							<div class="grid grid-cols-2 items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0">
								<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{a.typeName}</span>
								<span class="text-sm text-foreground">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if tomorrow}
				<div class="mb-4 border-t border-border pt-4">
					<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Tomorrow</div>
					{#if tomorrow.assignments.length === 0}
						<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							No assignments tomorrow.
						</p>
					{:else}
						{#each tomorrow.assignments as a (a.id)}
							<div class="grid grid-cols-2 items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0">
								<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{a.typeName}</span>
								<span class="text-sm text-foreground">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				</div>
			{/if}

			{#if ctx.todayAdvancedDuty.length > 0}
				{#each ctx.todayAdvancedDuty as event (event.id)}
					<div class="mb-4">
						<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							{event.templateName}
						</div>
						{#each event.slots as slot (slot.key)}
							<div class="grid grid-cols-2 items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0">
								<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{slot.roleLabel}</span
								>
								<span class="text-sm text-foreground">{slot.assigneeName}</span>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<div class="border-t border-border py-6 pb-2">
		<UpcomingLossesWidget losses={ctx.upcomingLosses} formatDate={(d) => ctx.formatShortDate(d)} />
	</div>

	<div class="grid items-start gap-8 border-t border-border py-8 pb-6 md:grid-cols-2">
		<div class="flex flex-col">
			<div class="mb-3 flex items-center gap-3">
				<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Onboarding</span
				>
				{#if ctx.activeOnboardings.length > 0}
					<Badge variant="secondary">{ctx.activeOnboardings.length}</Badge>
				{/if}
			</div>

			{#if ctx.activeOnboardings.length === 0}
				<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">No active onboardings.</p>
			{:else}
				{#each ctx.activeOnboardings as o (o.id)}
					<div
						class="grid grid-cols-[minmax(0,1fr)_80px_32px] items-center gap-2 border-t border-border/60 py-2 first:border-t-0"
					>
						<span class="truncate text-sm text-foreground">{o.personName}</span>
						<div class="h-0.5 overflow-hidden bg-muted">
							<div class={['h-full', o.pct >= 50 ? 'bg-success' : 'bg-warning']} style:width={`${o.pct}%`}></div>
						</div>
						<span class="text-right font-mono text-xs text-muted-foreground">{o.pct}%</span>
					</div>
				{/each}
			{/if}
		</div>

		<div class="flex flex-col">
			<div class="mb-3 flex items-center gap-3">
				<span class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Upcoming Changes
				</span>
				{#if ctx.upcomingChanges.length > 0}
					<Badge variant="secondary">{ctx.upcomingChanges.length}</Badge>
					<Tabs.Root
						value={view.upcomingChanges.mode}
						onValueChange={(mode) => view.upcomingChanges.setMode(mode as UpcomingGroupBy)}
					>
						<Tabs.List aria-label="People and duty upcoming changes grouping">
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
						class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0"
					>
						<span class="truncate text-sm text-foreground">{change.personName}</span>
						<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
							{ctx.formatShortDate(change.date)}
						</span>
						<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
							{change.direction === 'departing' ? change.statusName : 'Returning'}
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
							class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0"
						>
							<span class="truncate text-sm text-foreground">{change.personName}</span>
							<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
								{ctx.formatShortDate(change.date)}
							</span>
							<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
								{change.direction === 'departing' ? change.statusName : 'Returning'}
							</span>
						</div>
					{/each}
				{/each}
			{/if}
		</div>
	</div>
</section>
