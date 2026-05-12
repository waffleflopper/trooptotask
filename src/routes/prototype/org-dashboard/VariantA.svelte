<!-- PROTOTYPE Variant A: "Command Post"
     Dense single-scroll ops view. Hero strength bar, 4-column metric grid,
     group comparison bars, attention items, duty roster + activity feed.
     Flat, scannable, max information density. -->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import {
		orgStats,
		groups,
		statusBreakdown,
		dutyAssignments,
		onboardings,
		upcomingChanges,
		attentionItems,
		activityFeed,
		availabilityColor,
		availabilityBg,
		severityColor,
		severityDot,
		activityIcon,
		activityColor
	} from './mockData';

	const todayDuty = dutyAssignments.filter((d) => d.period === 'today');
	const tomorrowDuty = dutyAssignments.filter((d) => d.period === 'tomorrow');
</script>

<div class="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto pb-20">
	<!-- ═══════ HERO STRENGTH STRIP ═══════ -->
	<div class="border-b bg-card px-4 py-5 md:px-6">
		<div class="mb-4 flex items-end justify-between gap-4">
			<div>
				<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Organization Strength
				</div>
				<div class="mt-1 flex items-baseline gap-3">
					<span class="font-display text-5xl font-bold leading-none tracking-tight text-foreground">
						{orgStats.availableToday}
					</span>
					<span class="font-display text-2xl font-light text-muted-foreground">/ {orgStats.totalPersonnel}</span>
				</div>
			</div>
			<div class="text-right">
				<span class="font-display text-3xl font-bold leading-none {availabilityColor(orgStats.availablePct)}">
					{orgStats.availablePct}%
				</span>
				<div class="mt-0.5 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Available</div>
			</div>
		</div>

		<Progress value={orgStats.availablePct} class="mb-3" aria-label="Personnel availability" />

		<div class="flex flex-wrap gap-1.5">
			<Badge variant="success">{orgStats.availableToday} Present</Badge>
			{#each statusBreakdown as s (s.id)}
				<span
					class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.625rem] font-semibold"
				>
					<span class="size-1.5 rounded-full" style:background={s.color}></span>
					{s.count}
					{s.name}
				</span>
			{/each}
		</div>
	</div>

	<!-- ═══════ KEY METRICS GRID ═══════ -->
	<div class="grid grid-cols-2 border-b lg:grid-cols-4">
		<div class="border-r border-b p-4 lg:border-b-0">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Training Currency</div>
			<div class="mt-1 font-display text-3xl font-bold {availabilityColor(orgStats.trainingCurrency)}">
				{orgStats.trainingCurrency}%
			</div>
			<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">of personnel current</div>
		</div>

		<div class="border-b p-4 lg:border-r lg:border-b-0">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Evaluations</div>
			<div class="mt-1 flex items-baseline gap-3">
				<span class="font-display text-3xl font-bold text-destructive">{orgStats.evalsOverdue}</span>
				<span class="font-mono text-[0.625rem] text-muted-foreground">overdue</span>
			</div>
			<div class="mt-0.5 font-mono text-[0.625rem] text-warning-foreground">{orgStats.evalsDueSoon} due in 30d</div>
		</div>

		<div class="border-r p-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Onboarding</div>
			<div class="mt-1 font-display text-3xl font-bold text-foreground">{orgStats.activeOnboardings}</div>
			<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">active inprocessing</div>
		</div>

		<div class="p-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Open Positions</div>
			<div class="mt-1 font-display text-3xl font-bold text-foreground">{orgStats.openPositions}</div>
			<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">unfilled billets</div>
		</div>
	</div>

	<!-- ═══════ GROUP READINESS BARS ═══════ -->
	<div class="border-b px-4 py-5 md:px-6">
		<div class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
			Group Readiness
		</div>
		<div class="grid gap-2">
			{#each groups as g (g.id)}
				<div class="grid grid-cols-[80px_minmax(0,1fr)_48px_80px_80px] items-center gap-3">
					<span class="truncate font-mono text-xs font-semibold uppercase tracking-wide text-foreground">{g.name}</span>
					<div class="h-1.5 overflow-hidden rounded-full bg-muted">
						<div class="h-full rounded-full {availabilityBg(g.availablePct)}" style:width="{g.availablePct}%"></div>
					</div>
					<span class="text-right font-mono text-xs font-semibold {availabilityColor(g.availablePct)}">
						{g.availablePct}%
					</span>
					<span class="text-right font-mono text-[0.625rem] text-muted-foreground">
						{g.available}/{g.assigned} avail
					</span>
					<span class="text-right font-mono text-[0.625rem] {availabilityColor(g.trainingCurrency)}">
						{g.trainingCurrency}% trng
					</span>
				</div>
			{/each}
		</div>
	</div>

	<!-- ═══════ ATTENTION ITEMS ═══════ -->
	<div class="border-b px-4 py-5 md:px-6">
		<div class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
			Requires Attention
		</div>
		<div class="grid gap-0.5">
			{#each attentionItems as item (item.id)}
				<div class="flex items-start gap-3 rounded px-2 py-2 transition-colors hover:bg-muted/40">
					<span class="mt-1.5 size-2 shrink-0 rounded-full {severityDot(item.severity)}"></span>
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium text-foreground">{item.message}</div>
						<div class="font-mono text-[0.625rem] text-muted-foreground">{item.detail}</div>
					</div>
					{#if item.count}
						<span
							class="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.625rem] font-semibold {severityColor(
								item.severity
							)}"
						>
							{item.count}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- ═══════ DUTY + ACTIVITY ═══════ -->
	<div class="grid gap-0 md:grid-cols-2">
		<!-- Duty Roster -->
		<div class="border-b border-r px-4 py-5 md:border-b-0 md:px-6">
			<div class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
				Duty Roster
			</div>

			<div class="mb-2 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Today</div>
			{#each todayDuty as d (d.id)}
				<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border/60 py-2">
					<span class="font-mono text-xs uppercase tracking-wide text-muted-foreground">{d.type}</span>
					<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
				</div>
			{/each}

			<div class="mb-2 mt-4 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Tomorrow</div>
			{#each tomorrowDuty as d (d.id)}
				<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-border/60 py-2">
					<span class="font-mono text-xs uppercase tracking-wide text-muted-foreground">{d.type}</span>
					<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
				</div>
			{/each}

			<Separator class="my-4" />

			<!-- Onboarding -->
			<div class="mb-3 flex items-center gap-2">
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Onboarding
				</span>
				<Badge variant="secondary">{onboardings.length}</Badge>
			</div>
			{#each onboardings as o (o.id)}
				<div class="grid grid-cols-[minmax(0,1fr)_80px_32px] items-center gap-2 border-t border-border/60 py-2">
					<span class="truncate text-sm text-foreground">{o.name}</span>
					<div class="h-1 overflow-hidden rounded-full bg-muted">
						<div
							class={['h-full rounded-full', o.pct >= 50 ? 'bg-success' : 'bg-warning']}
							style:width="{o.pct}%"
						></div>
					</div>
					<span class="text-right font-mono text-[0.625rem] text-muted-foreground">{o.pct}%</span>
				</div>
			{/each}
		</div>

		<!-- Activity Feed -->
		<div class="px-4 py-5 md:px-6">
			<div class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
				Activity
			</div>
			<div class="grid gap-0">
				{#each activityFeed as entry (entry.id)}
					<div class="flex gap-3 border-t border-border/60 py-2.5 first:border-t-0">
						<div
							class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded font-mono text-[0.5rem] font-bold uppercase {activityColor(
								entry.type
							)}"
						>
							{activityIcon(entry.type)}
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-sm text-foreground">{entry.message}</div>
							{#if entry.detail}
								<div class="font-mono text-[0.625rem] text-muted-foreground">{entry.detail}</div>
							{/if}
						</div>
						<span class="shrink-0 font-mono text-[0.625rem] text-muted-foreground">{entry.timestamp}</span>
					</div>
				{/each}
			</div>

			<Separator class="my-4" />

			<!-- Upcoming Changes -->
			<div class="mb-3 flex items-center gap-2">
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Upcoming Changes
				</span>
				<Badge variant="secondary">{upcomingChanges.length}</Badge>
			</div>
			{#each upcomingChanges as change (change.id)}
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0"
				>
					<span class="truncate text-sm text-foreground">{change.personName}</span>
					<span class="font-mono text-[0.625rem] uppercase tracking-wide text-muted-foreground">
						{change.date} · {change.direction === 'departing' ? change.statusName : 'Returning'}
					</span>
				</div>
			{/each}
		</div>
	</div>
</div>
