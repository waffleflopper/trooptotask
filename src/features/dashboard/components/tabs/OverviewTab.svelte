<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';

	interface Props {
		ctx: DashboardScreenModel;
	}

	let { ctx }: Props = $props();

	const view = $derived(ctx.unitReadiness);
	const trainingGroupDelinquencies = $derived(ctx.trainingGroupDelinquencies);

	const showsEvaluations = $derived(ctx.isFeatureOn('evaluations'));
	const showsTraining = $derived(ctx.trainingStats !== null);
	const readinessCardTitle = $derived(
		[showsTraining && 'Training', showsEvaluations && 'Evaluations'].filter(Boolean).join(' & ')
	);
</script>

<section class="px-3 pb-12 sm:px-4">
	<div class="grid gap-3 py-4 md:grid-cols-2 lg:grid-cols-3">
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
	</div>
</section>
