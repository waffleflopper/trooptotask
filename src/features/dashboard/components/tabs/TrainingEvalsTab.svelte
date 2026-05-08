<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { DashboardContext } from '../../contexts/DashboardContext.svelte';

	interface Props {
		ctx: DashboardContext;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.trainingEvals);
</script>

<section class="px-4 pb-12">
	{#if view.hasTrainingIssues && ctx.trainingStats}
		<div class="grid grid-cols-3 py-6">
			<div class="px-4 pl-0">
				<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Expired</div>
				<div class="text-4xl leading-none font-semibold tracking-tight text-danger">{ctx.trainingStats.expired}</div>
				<div class="mt-1 text-sm text-muted-foreground">records</div>
			</div>
			<div class="border-l border-border px-4">
				<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Expiring in 30</div>
				<div class="text-4xl leading-none font-semibold tracking-tight text-warning-foreground">
					{ctx.trainingStats.warningOrange}
				</div>
				<div class="mt-1 text-sm text-muted-foreground">records</div>
			</div>
			<div class="border-l border-border px-4">
				<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Currency</div>
				<div class="text-4xl leading-none font-semibold tracking-tight" style:color={view.trainingColor}>
					{ctx.trainingCurrencyPct}%
				</div>
				<div class="mt-1 text-sm text-muted-foreground">personnel current</div>
			</div>
		</div>
	{:else if ctx.trainingStats === null}
		<div class="grid grid-cols-3 py-6">
			{#each ['Expired', 'Expiring in 30', 'Currency'] as label, index (label)}
				<div class={[index > 0 && 'border-l border-border', 'px-4 first:pl-0']}>
					<Skeleton class="mb-2 h-3 w-20" />
					<Skeleton class="h-10 w-14" />
				</div>
			{/each}
		</div>
	{/if}

	<div class="grid gap-8 border-t border-border py-8 md:grid-cols-2">
		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				By Section
			</div>
			{#if view.delinquencies.length === 0}
				<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">All sections current.</p>
			{:else}
				{#each view.delinquencies as g (g.groupName)}
					<div class="grid grid-cols-[72px_minmax(0,1fr)_32px] items-center gap-2 py-1">
						<span class="truncate font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							{g.groupName}
						</span>
						<div class="h-0.5 overflow-hidden bg-muted">
							<div class="h-full bg-danger" style:width={`${Math.max((g.count / view.maxGroupCount) * 100, 4)}%`}></div>
						</div>
						<span class="text-right font-mono text-xs font-semibold text-danger">~{g.count}</span>
					</div>
				{/each}
			{/if}
		</div>

		<div class="flex flex-col">
			<div class="mb-3 font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
				Individuals
			</div>
			{#if view.groupedIndividuals.length === 0}
				<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">No individual issues.</p>
			{:else}
				<div class="max-h-80 overflow-y-auto">
					{#each view.groupedIndividuals as person (person.personName)}
						<div
							class="grid grid-cols-[120px_minmax(0,1fr)_auto] items-baseline gap-2 border-t border-border/60 py-2 first:border-t-0"
						>
							<span class="truncate text-sm text-foreground">{person.personName}</span>
							<span class="truncate font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
								{person.typeNames}
							</span>
							<Badge variant={person.isExpired ? 'danger' : 'warning'}>{person.label}</Badge>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="border-t border-border py-8">
		<div class="mb-5 text-xl font-semibold tracking-tight text-foreground">Evaluation Pipeline</div>

		{#if view.evalsDueSoon.length === 0}
			<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
				No evaluations due within 90 days.
			</p>
		{:else}
			<div class="flex flex-col">
				{#each view.evalsDueSoon as entry (entry.id)}
					<div
						class="grid grid-cols-[130px_minmax(0,1fr)_auto_auto] items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0"
					>
						<span class="truncate text-sm text-foreground">{entry.personName}</span>
						<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{entry.evalType}</span>
						<span class="font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase">
							{ctx.formatShortDate(entry.ratingPeriodEnd)}
						</span>
						<Badge variant={entry.status === 'overdue' ? 'danger' : entry.status === 'due-30' ? 'warning' : 'outline'}>
							{entry.status === 'overdue' ? `Overdue ${Math.abs(entry.daysUntil)}d` : `Due ${entry.daysUntil}d`}
						</Badge>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if view.ictl.state === 'empty'}
		<section class="border-t border-border pt-8" aria-label="Critical Tasks summary">
			<div class="mb-5 flex items-start justify-between gap-4">
				<div>
					<div class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Critical Tasks</div>
					<h3 class="mt-1 text-xl font-semibold tracking-tight text-foreground">No active tasks configured.</h3>
				</div>
				<Button href={view.ictl.reportHref} variant="outline" size="sm">Open reports</Button>
			</div>
			<p class="text-sm text-muted-foreground">Add active ICTL tasks before readiness can be summarized here.</p>
		</section>
	{:else if view.ictl.state === 'ready'}
		<section class="border-t border-border pt-8" aria-label="Critical Tasks summary">
			<div class="mb-5 flex items-start justify-between gap-4">
				<div>
					<div class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Critical Tasks</div>
					<h3 class="mt-1 text-xl font-semibold tracking-tight text-foreground">ICTL Readiness</h3>
				</div>
				<Button href={view.ictl.reportHref} variant="outline" size="sm">Open reports</Button>
			</div>

			<div class="mb-6 grid gap-6 md:grid-cols-[minmax(180px,0.8fr)_1.2fr]">
				<div class="flex flex-col gap-2">
					<span
						class="text-4xl leading-none font-semibold tracking-tight uppercase"
						style:color={view.ictl.readinessColor}
					>
						{view.ictl.readinessLabel}
					</span>
					<span class="text-sm text-muted-foreground">
						{view.ictl.readyCount} of {view.ictl.applicableCount} applicable records ready
					</span>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">{view.ictl.deltaLabel}</span
					>
				</div>

				<div class="flex flex-col gap-2">
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
						>{view.ictl.primaryConcern}</span
					>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
						{view.ictl.expiringSoonLabel}
					</span>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
						{view.ictl.tasksBelowThresholdLabel}
					</span>
					<span class="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
						{view.ictl.projectedReadinessLabel}
					</span>
				</div>
			</div>

			{#if view.ictl.mosReadiness.length > 0}
				<div class="mb-6 flex flex-col gap-2" aria-label="Critical Tasks MOS readiness">
					{#each view.ictl.mosReadiness as row (row.mos)}
						<div class="grid grid-cols-[56px_minmax(72px,1fr)_48px_58px] items-center gap-2">
							<span class="font-mono text-xs font-semibold tracking-[0.08em] text-foreground uppercase">{row.mos}</span>
							<div class="h-0.75 overflow-hidden bg-muted">
								<div class="h-full bg-primary" style:width={`${Math.max(row.readinessPercent, 4)}%`}></div>
							</div>
							<span class="font-mono text-xs font-semibold tracking-[0.08em] text-foreground uppercase">
								{row.readinessPercent}%
							</span>
							<span class="text-right font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
								{row.personnelCount} pax
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="grid gap-8 md:grid-cols-2">
				<div>
					<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">Below Threshold</div>
					{#if view.ictl.tasksBelowThreshold.length === 0}
						<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
							No tasks below threshold.
						</p>
					{:else}
						{#each view.ictl.tasksBelowThreshold as task (task.taskId)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-border/60 py-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
							>
								<span class="truncate text-foreground">{task.taskCode}</span>
								<span>{task.percentComplete}%</span>
								<span>{task.soldierGapCount} gap</span>
							</div>
						{/each}
					{/if}
				</div>
				<div>
					<div class="mb-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">At Risk</div>
					{#if view.ictl.atRiskSoldiers.length === 0}
						<p class="py-4 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">No at-risk Soldiers.</p>
					{:else}
						{#each view.ictl.atRiskSoldiers as soldier (soldier.personnelId)}
							<div
								class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-border/60 py-2 font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
							>
								<span class="truncate text-foreground">{soldier.soldierName}</span>
								<span>{soldier.readinessPercent}%</span>
								<span>{soldier.tasksExpiringSoonCount} exp</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</section>
	{/if}
</section>
