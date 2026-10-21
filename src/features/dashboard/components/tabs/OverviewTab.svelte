<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import { CalendarStatusBadge } from '$features/calendar';
	import * as Card from '$lib/components/ui/card';
	import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';

	interface Props {
		ctx: DashboardScreenModel;
	}

	let { ctx }: Props = $props();

	const CARD_LIMIT = 6;
	const uid = $props.id();

	const view = $derived(ctx.unitReadiness);
	const statusEntries = $derived(view.statusEntries);
	const trainingGroupDelinquencies = $derived(ctx.trainingGroupDelinquencies);

	let outTodayExpanded = $state(false);

	const visibleOutToday = $derived(
		outTodayExpanded ? ctx.nonAvailablePersonnel : ctx.nonAvailablePersonnel.slice(0, CARD_LIMIT)
	);
	const showsEvaluations = $derived(ctx.isFeatureOn('evaluations'));
	const showsTraining = $derived(ctx.trainingStats !== null);
	const readinessCardTitle = $derived(
		[showsTraining && 'Training', showsEvaluations && 'Evaluations'].filter(Boolean).join(' & ')
	);
</script>

<section class="px-3 pb-12 sm:px-4">
	<div class="grid gap-3 py-4 md:grid-cols-2 lg:grid-cols-3">
		<Card.Root class="lg:col-span-2">
			<Card.Content class="pt-4">
				<div class="mb-4 flex items-start justify-between">
					<div>
						<div class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
							Strength & Availability
						</div>
						<div class="mt-2 flex items-baseline gap-3">
							<span class="font-display text-5xl font-bold leading-none tracking-tight text-foreground">
								{ctx.availableCount}
							</span>
							<span class="font-display text-xl font-light text-muted-foreground">/ {ctx.totalPersonnel}</span>
							<span class="ml-2 font-display text-2xl font-bold" style:color={view.availColor}>
								{view.availPct}%
							</span>
						</div>
					</div>
					{#if ctx.nonAvailablePersonnel.length > 0}
						<Badge variant="secondary">{ctx.nonAvailablePersonnel.length} out</Badge>
					{/if}
				</div>

				<Progress value={view.availPct} class="mb-4" aria-label="Personnel availability" />

				<div class="flex flex-wrap gap-1.5">
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

				{#if ctx.groupBreakdown.length > 0}
					<Separator class="my-4" />
					<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{#each ctx.groupBreakdown as g (g.id)}
							<div class="flex flex-col items-center gap-1 rounded-sm border px-2 py-2">
								<span class="font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
									{g.name}
								</span>
								<span class="font-display text-lg font-bold" style:color={view.availabilityColor(g.pct)}>
									{g.pct}%
								</span>
								<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
									<div class="h-full rounded-full bg-primary" style:width="{g.pct}%"></div>
								</div>
								<span class="font-mono text-[0.5rem] text-muted-foreground">{g.available}/{g.total}</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if showsTraining || showsEvaluations}
			<Card.Root>
				<Card.Header>
					<Card.Title>{readinessCardTitle}</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="grid grid-cols-2 gap-4">
						{#if ctx.trainingStats}
							<div>
								<div class="font-display text-4xl font-bold" style:color={view.trainingColor}>
									{ctx.trainingCurrencyPct}%
								</div>
								<div class="font-mono text-[0.625rem] text-muted-foreground">training current</div>
							</div>
						{/if}
						{#if showsEvaluations}
							<div>
								<div class="font-display text-4xl font-bold text-destructive">{ctx.ratingStats.overdue}</div>
								<div class="font-mono text-[0.625rem] text-muted-foreground">evals overdue</div>
							</div>
						{/if}
					</div>

					{#if ctx.trainingStats}
						<div class="mt-2 flex gap-3">
							{#if ctx.trainingStats.expired > 0}
								<span class="font-mono text-[0.625rem] text-destructive">{ctx.trainingStats.expired} expired</span>
							{/if}
							{#if ctx.trainingStats.warningOrange > 0}
								<span class="font-mono text-[0.625rem] text-warning-foreground">
									{ctx.trainingStats.warningOrange} expiring
								</span>
							{/if}
						</div>
					{/if}

					{#if ctx.trainingStats && ctx.groupBreakdown.length > 0}
						<Separator class="my-3" />
						<div class="grid gap-1.5">
							{#each ctx.groupBreakdown as g (g.id)}
								{@const delinquency = trainingGroupDelinquencies.find((d) => d.groupId === g.id)}
								{@const currencyPct =
									g.total > 0 ? Math.max(0, Math.round(((g.total - (delinquency?.count ?? 0)) / g.total) * 100)) : 100}
								<div class="flex items-center gap-2">
									<span class="w-14 truncate font-mono text-[0.625rem] font-semibold uppercase text-muted-foreground">
										{g.name}
									</span>
									<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
										<div class="h-full rounded-full bg-primary" style:width="{currencyPct}%"></div>
									</div>
									<span
										class="w-8 text-right font-mono text-[0.625rem]"
										style:color={view.trainingCurrencyColor(currencyPct)}
									>
										{currencyPct}%
									</span>
									{#if delinquency && delinquency.count > 0}
										<span class="w-4 text-right font-mono text-[0.625rem] text-destructive">
											{delinquency.count}
										</span>
									{:else}
										<span class="w-4"></span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

		{#if ctx.isFeatureOn('onboarding')}
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<Card.Title>Onboarding</Card.Title>
						{#if ctx.activeOnboardings.length > 0}
							<Badge variant="secondary">{ctx.activeOnboardings.length}</Badge>
						{/if}
					</div>
				</Card.Header>
				{#if ctx.activeOnboardings.length === 0}
					<Card.Content>
						<p class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
							No active onboardings
						</p>
					</Card.Content>
				{:else}
					<div class="divide-y">
						{#each ctx.activeOnboardings as o (o.id)}
							<div class="flex items-center gap-3 px-4 py-2.5">
								<span class="min-w-0 flex-1 truncate text-sm text-foreground">{o.personName}</span>
								<div class="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
									<div
										class={['h-full rounded-full', o.pct >= 50 ? 'bg-success' : 'bg-warning']}
										style:width="{o.pct}%"
									></div>
								</div>
								<span class="w-8 text-right font-mono text-[0.625rem] font-semibold text-muted-foreground">
									{o.pct}%
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Root>
		{/if}

		{#if ctx.nonAvailablePersonnel.length > 0}
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<Card.Title>Out Today</Card.Title>
						<Badge variant="secondary">{ctx.nonAvailablePersonnel.length}</Badge>
					</div>
				</Card.Header>
				<div id="{uid}-out-today" class="divide-y">
					{#each visibleOutToday as person (person.id)}
						<div class="flex items-center justify-between gap-2 px-4 py-2">
							<div class="flex min-w-0 items-baseline gap-1">
								<span class="shrink-0 font-mono text-[0.625rem] uppercase text-muted-foreground">
									{person.rank}
								</span>
								<span class="truncate text-sm text-foreground">
									{person.personName.replace(/^[A-Z0-9]+ /, '')}
								</span>
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
				</div>
				{#if ctx.nonAvailablePersonnel.length > CARD_LIMIT}
					<div class="border-t">
						<Button
							variant="ghost"
							size="sm"
							class="w-full"
							aria-expanded={outTodayExpanded}
							aria-controls="{uid}-out-today"
							onclick={() => (outTodayExpanded = !outTodayExpanded)}
						>
							{outTodayExpanded ? 'Show less' : `+${ctx.nonAvailablePersonnel.length - CARD_LIMIT} more`}<span
								class="sr-only"
							>
								in Out Today</span
							>
						</Button>
					</div>
				{/if}
			</Card.Root>
		{/if}
	</div>
</section>
