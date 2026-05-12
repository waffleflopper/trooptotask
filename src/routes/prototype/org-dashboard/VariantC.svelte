<!-- PROTOTYPE Variant C: "Split Rail"
     Two-panel layout. Sticky left summary rail with stacked metric sections
     (strength, training, evals, onboarding). Scrollable right main panel with
     attention items, duty roster, upcoming changes, and activity timeline.
     The rail provides constant context while the main area scrolls. -->
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

<div class="flex min-h-0 flex-1 overflow-hidden">
	<!-- ═══════ LEFT RAIL ═══════ -->
	<aside class="hidden w-80 shrink-0 overflow-y-auto border-r bg-card lg:block">
		<div class="sticky top-0 z-10 border-b bg-card px-5 py-4">
			<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
				Organization Summary
			</div>
			<div class="mt-1 text-lg font-semibold text-foreground">12 MAY 2026</div>
		</div>

		<!-- Strength -->
		<div class="border-b px-5 py-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Strength</div>
			<div class="mt-2 flex items-baseline gap-2">
				<span class="font-display text-4xl font-bold leading-none {availabilityColor(orgStats.availablePct)}">
					{orgStats.availablePct}%
				</span>
				<span class="font-mono text-xs text-muted-foreground">{orgStats.availableToday}/{orgStats.totalPersonnel}</span>
			</div>
			<Progress value={orgStats.availablePct} class="mt-2" aria-label="Personnel availability" />
			<div class="mt-3 grid gap-1">
				{#each statusBreakdown as s (s.id)}
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-1.5">
							<span class="size-2 rounded-full" style:background={s.color}></span>
							<span class="font-mono text-[0.625rem] text-muted-foreground">{s.name}</span>
						</div>
						<span class="font-mono text-[0.625rem] font-semibold text-foreground">{s.count}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Training -->
		<div class="border-b px-5 py-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Training Currency</div>
			<div class="mt-2 flex items-baseline gap-2">
				<span class="font-display text-4xl font-bold leading-none {availabilityColor(orgStats.trainingCurrency)}">
					{orgStats.trainingCurrency}%
				</span>
				<span class="font-mono text-[0.625rem] text-muted-foreground">current</span>
			</div>
			<div class="mt-3 grid gap-1.5">
				{#each groups as g (g.id)}
					<div class="flex items-center gap-2">
						<span class="w-12 font-mono text-[0.625rem] uppercase text-muted-foreground">{g.name}</span>
						<div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full {availabilityBg(g.trainingCurrency)}"
								style:width="{g.trainingCurrency}%"
							></div>
						</div>
						<span class="w-7 text-right font-mono text-[0.625rem] {availabilityColor(g.trainingCurrency)}">
							{g.trainingCurrency}%
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Evaluations -->
		<div class="border-b px-5 py-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Evaluations</div>
			<div class="mt-2 grid grid-cols-2 gap-3">
				<div>
					<div class="font-display text-3xl font-bold text-destructive">{orgStats.evalsOverdue}</div>
					<div class="font-mono text-[0.625rem] text-muted-foreground">overdue</div>
				</div>
				<div>
					<div class="font-display text-3xl font-bold text-warning-foreground">{orgStats.evalsDueSoon}</div>
					<div class="font-mono text-[0.625rem] text-muted-foreground">due 30d</div>
				</div>
			</div>
		</div>

		<!-- Onboarding -->
		<div class="border-b px-5 py-4">
			<div class="mb-2 flex items-center gap-2">
				<span class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Onboarding</span>
				<Badge variant="secondary">{onboardings.length}</Badge>
			</div>
			{#each onboardings as o (o.id)}
				<div class="flex items-center gap-2 py-1.5">
					<span class="min-w-0 flex-1 truncate text-sm text-foreground">{o.name}</span>
					<div class="h-1 w-12 overflow-hidden rounded-full bg-muted">
						<div
							class={['h-full rounded-full', o.pct >= 50 ? 'bg-success' : 'bg-warning']}
							style:width="{o.pct}%"
						></div>
					</div>
					<span class="w-7 text-right font-mono text-[0.625rem] text-muted-foreground">{o.pct}%</span>
				</div>
			{/each}
		</div>

		<!-- Groups -->
		<div class="px-5 py-4">
			<div class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">By Group</div>
			<div class="mt-2 grid gap-2">
				{#each groups as g (g.id)}
					<div class="flex items-center justify-between rounded-md border px-3 py-2">
						<div>
							<span class="font-mono text-xs font-semibold uppercase text-foreground">{g.name}</span>
							<div class="font-mono text-[0.625rem] text-muted-foreground">{g.available}/{g.assigned} avail</div>
						</div>
						<span class="font-display text-lg font-bold {availabilityColor(g.availablePct)}">{g.availablePct}%</span>
					</div>
				{/each}
			</div>
		</div>
	</aside>

	<!-- ═══════ MAIN CONTENT ═══════ -->
	<main class="flex-1 overflow-y-auto pb-20">
		<!-- Mobile-only summary strip (visible below lg) -->
		<div class="flex items-center justify-between border-b bg-card px-4 py-3 lg:hidden">
			<div class="flex items-baseline gap-2">
				<span class="font-display text-2xl font-bold {availabilityColor(orgStats.availablePct)}">
					{orgStats.availablePct}%
				</span>
				<span class="font-mono text-xs text-muted-foreground">{orgStats.availableToday}/{orgStats.totalPersonnel}</span>
			</div>
			<div class="flex gap-3">
				<div class="text-center">
					<div class="font-mono text-xs font-semibold {availabilityColor(orgStats.trainingCurrency)}">
						{orgStats.trainingCurrency}%
					</div>
					<div class="font-mono text-[0.5rem] text-muted-foreground">TRNG</div>
				</div>
				<div class="text-center">
					<div class="font-mono text-xs font-semibold text-destructive">{orgStats.evalsOverdue}</div>
					<div class="font-mono text-[0.5rem] text-muted-foreground">EVALS</div>
				</div>
			</div>
		</div>

		<div class="p-4 md:p-6">
			<!-- Attention Items -->
			<section class="mb-6">
				<h2 class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Requires Attention
				</h2>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each attentionItems as item (item.id)}
						<div
							class="flex items-start gap-3 rounded-lg border p-3 {item.severity === 'danger'
								? 'border-destructive/30 bg-destructive/5'
								: ''}"
						>
							<span class="mt-0.5 size-2 shrink-0 rounded-full {severityDot(item.severity)}"></span>
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium text-foreground">{item.message}</div>
								<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">{item.detail}</div>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<Separator class="mb-6" />

			<!-- Duty Roster + Upcoming Changes side by side -->
			<div class="mb-6 grid gap-6 md:grid-cols-2">
				<section>
					<h2 class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
						Duty Roster
					</h2>
					<div class="rounded-lg border bg-card">
						<div class="border-b px-4 py-2">
							<span class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Today</span>
						</div>
						{#each todayDuty as d (d.id)}
							<div class="flex items-baseline justify-between border-t border-border/60 px-4 py-2 first:border-t-0">
								<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{d.type}</span>
								<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
							</div>
						{/each}
						<div class="border-b border-t px-4 py-2">
							<span class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Tomorrow</span>
						</div>
						{#each tomorrowDuty as d (d.id)}
							<div class="flex items-baseline justify-between border-t border-border/60 px-4 py-2 first:border-t-0">
								<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{d.type}</span>
								<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
							</div>
						{/each}
					</div>
				</section>

				<section>
					<div class="mb-3 flex items-center gap-2">
						<h2 class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
							Upcoming Changes
						</h2>
						<Badge variant="secondary">{upcomingChanges.length}</Badge>
					</div>
					<div class="rounded-lg border bg-card">
						{#each upcomingChanges as change (change.id)}
							<div
								class="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5 first:border-t-0"
							>
								<div class="min-w-0">
									<div class="truncate text-sm text-foreground">{change.personName}</div>
									<div class="font-mono text-[0.625rem] text-muted-foreground">{change.group}</div>
								</div>
								<div class="shrink-0 text-right">
									<div class="font-mono text-[0.625rem] font-semibold text-foreground">{change.date}</div>
									<div class="font-mono text-[0.625rem] text-muted-foreground">
										{change.direction === 'departing' ? change.statusName : 'Returning'}
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			</div>

			<Separator class="mb-6" />

			<!-- Activity Timeline -->
			<section>
				<h2 class="mb-3 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Activity
				</h2>
				<div class="relative">
					<div class="absolute left-3 top-0 bottom-0 w-px bg-border"></div>
					<div class="grid gap-0">
						{#each activityFeed as entry (entry.id)}
							<div class="relative flex items-start gap-4 py-3 pl-9">
								<div
									class="absolute left-1 top-3.5 flex size-5 items-center justify-center rounded-full border bg-card font-mono text-[0.5rem] font-bold uppercase {activityColor(
										entry.type
									)}"
								>
									{activityIcon(entry.type)}
								</div>
								<div class="min-w-0 flex-1">
									<div class="text-sm text-foreground">{entry.message}</div>
									{#if entry.detail}
										<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">{entry.detail}</div>
									{/if}
								</div>
								<span class="shrink-0 font-mono text-[0.625rem] text-muted-foreground">{entry.timestamp}</span>
							</div>
						{/each}
					</div>
				</div>
			</section>
		</div>
	</main>
</div>
