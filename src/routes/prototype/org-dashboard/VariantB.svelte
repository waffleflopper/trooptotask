<!-- PROTOTYPE Variant B: "Bento Board"
     Asymmetric bento grid with varying card sizes. Large hero card for strength,
     medium cards for training/evals/duty, small cards for onboarding/changes/alerts.
     Uses rounded-lg borders and bg-card. Dynamic visual rhythm through card size. -->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import {
		orgStats,
		groups,
		statusBreakdown,
		dutyAssignments,
		onboardings,
		upcomingChanges,
		attentionItems,
		availabilityColor,
		availabilityBg,
		severityColor,
		severityDot
	} from './mockData';

	const todayDuty = dutyAssignments.filter((d) => d.period === 'today');
	const tomorrowDuty = dutyAssignments.filter((d) => d.period === 'tomorrow');
	const dangerItems = attentionItems.filter((i) => i.severity === 'danger');
	const warningItems = attentionItems.filter((i) => i.severity === 'warning');
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pb-20 md:p-6">
	<!-- ═══════ BENTO GRID ═══════ -->
	<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
		<!-- LARGE: Strength & Availability (spans 2 cols on lg) -->
		<div class="rounded-lg border bg-card p-5 lg:col-span-2">
			<div class="mb-4 flex items-start justify-between">
				<div>
					<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
						Strength & Availability
					</div>
					<div class="mt-2 flex items-baseline gap-3">
						<span class="font-display text-5xl font-bold leading-none tracking-tight text-foreground">
							{orgStats.availableToday}
						</span>
						<span class="font-display text-xl font-light text-muted-foreground">/ {orgStats.totalPersonnel}</span>
						<span class="ml-2 font-display text-2xl font-bold {availabilityColor(orgStats.availablePct)}">
							{orgStats.availablePct}%
						</span>
					</div>
				</div>
				<Badge variant="secondary">{orgStats.nonAvailableToday} out</Badge>
			</div>

			<Progress value={orgStats.availablePct} class="mb-4" aria-label="Personnel availability" />

			<div class="flex flex-wrap gap-1.5">
				{#each statusBreakdown as s (s.id)}
					<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.625rem]">
						<span class="size-2 rounded-full" style:background={s.color}></span>
						<span class="font-semibold">{s.count}</span>
						<span class="text-muted-foreground">{s.name}</span>
					</span>
				{/each}
			</div>

			<!-- Group mini-bars inline -->
			<div class="mt-4 grid gap-1.5 border-t pt-4 sm:grid-cols-5">
				{#each groups as g (g.id)}
					<div class="flex flex-col items-center gap-1 rounded-md border px-2 py-2">
						<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
							{g.name}
						</span>
						<span class="font-display text-lg font-bold {availabilityColor(g.availablePct)}">{g.availablePct}%</span>
						<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
							<div class="h-full rounded-full {availabilityBg(g.availablePct)}" style:width="{g.availablePct}%"></div>
						</div>
						<span class="font-mono text-[0.5rem] text-muted-foreground">{g.available}/{g.assigned}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- MEDIUM: Attention Required -->
		<div class="row-span-2 flex flex-col rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<div class="flex items-center justify-between">
					<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
						Attention Required
					</span>
					<Badge variant="destructive">{dangerItems.length + warningItems.length}</Badge>
				</div>
			</div>
			<div class="flex flex-1 flex-col divide-y overflow-auto">
				{#each attentionItems as item (item.id)}
					<div class="flex items-start gap-3 px-4 py-3">
						<span class="mt-1 size-2 shrink-0 rounded-full {severityDot(item.severity)}"></span>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-foreground">{item.message}</div>
							<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">{item.detail}</div>
						</div>
						{#if item.count}
							<span class="shrink-0 font-mono text-xs font-semibold {severityColor(item.severity)}">{item.count}</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- MEDIUM: Training + Evals combined -->
		<div class="rounded-lg border bg-card p-5">
			<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
				Training & Evaluations
			</div>

			<div class="mt-3 grid grid-cols-2 gap-4">
				<div>
					<div class="font-display text-4xl font-bold {availabilityColor(orgStats.trainingCurrency)}">
						{orgStats.trainingCurrency}%
					</div>
					<div class="font-mono text-[0.625rem] text-muted-foreground">training current</div>
				</div>
				<div>
					<div class="flex items-baseline gap-2">
						<span class="font-display text-4xl font-bold text-destructive">{orgStats.evalsOverdue}</span>
					</div>
					<div class="font-mono text-[0.625rem] text-muted-foreground">evals overdue</div>
				</div>
			</div>

			<div class="mt-4 border-t pt-3">
				<div class="grid gap-1.5">
					{#each groups as g (g.id)}
						<div class="flex items-center gap-2">
							<span class="w-14 truncate font-mono text-[0.625rem] font-semibold uppercase text-muted-foreground">
								{g.name}
							</span>
							<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full {availabilityBg(g.trainingCurrency)}"
									style:width="{g.trainingCurrency}%"
								></div>
							</div>
							<span class="w-8 text-right font-mono text-[0.625rem] {availabilityColor(g.trainingCurrency)}">
								{g.trainingCurrency}%
							</span>
							{#if g.evalsOverdue > 0}
								<span class="w-4 text-right font-mono text-[0.625rem] text-destructive">{g.evalsOverdue}</span>
							{:else}
								<span class="w-4"></span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- MEDIUM: Duty Roster -->
		<div class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Duty Roster
				</span>
			</div>
			<div class="px-4 py-3">
				<div class="mb-1 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Today</div>
				{#each todayDuty as d (d.id)}
					<div class="flex items-baseline justify-between gap-2 border-t border-border/60 py-1.5">
						<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{d.type}</span>
						<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
					</div>
				{/each}

				<div class="mb-1 mt-3 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Tomorrow</div>
				{#each tomorrowDuty as d (d.id)}
					<div class="flex items-baseline justify-between gap-2 border-t border-border/60 py-1.5">
						<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{d.type}</span>
						<span class="text-sm text-foreground">{d.rank} {d.assignee}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- SMALL: Onboarding -->
		<div class="rounded-lg border bg-card">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Onboarding
				</span>
				<Badge variant="secondary">{onboardings.length}</Badge>
			</div>
			<div class="divide-y">
				{#each onboardings as o (o.id)}
					<div class="flex items-center gap-3 px-4 py-2.5">
						<span class="min-w-0 flex-1 truncate text-sm text-foreground">{o.name}</span>
						<div class="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
							<div
								class={['h-full rounded-full', o.pct >= 50 ? 'bg-success' : 'bg-warning']}
								style:width="{o.pct}%"
							></div>
						</div>
						<span class="w-8 text-right font-mono text-[0.625rem] font-semibold text-muted-foreground">{o.pct}%</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- SMALL: Upcoming Changes -->
		<div class="rounded-lg border bg-card">
			<div class="flex items-center justify-between border-b px-4 py-3">
				<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Upcoming Changes
				</span>
				<Badge variant="secondary">{upcomingChanges.length}</Badge>
			</div>
			<div class="divide-y">
				{#each upcomingChanges as change (change.id)}
					<div class="flex items-baseline justify-between gap-2 px-4 py-2">
						<span class="min-w-0 truncate text-sm text-foreground">{change.personName}</span>
						<span class="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
							{change.date} · {change.direction === 'departing' ? change.statusName : 'Returning'}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- SMALL: Open Positions -->
		<div class="flex flex-col justify-between rounded-lg border bg-card p-5">
			<div>
				<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
					Open Positions
				</div>
				<div class="mt-2 font-display text-4xl font-bold text-foreground">{orgStats.openPositions}</div>
				<div class="mt-1 font-mono text-[0.625rem] text-muted-foreground">unfilled billets</div>
			</div>
			<div class="mt-3 border-t pt-3 font-mono text-[0.625rem] text-muted-foreground">2nd PLT (2) · WPNS (1)</div>
		</div>
	</div>
</div>
