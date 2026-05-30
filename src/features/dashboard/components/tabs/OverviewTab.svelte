<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import { Separator } from '$lib/components/ui/separator';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import * as Card from '$lib/components/ui/card';
	import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';

	interface Props {
		ctx: DashboardScreenModel;
	}

	let { ctx }: Props = $props();

	const CARD_LIMIT = 6;

	const view = $derived(ctx.unitReadiness);
	const statusEntries = $derived(view.statusEntries);
	const dutyDays = $derived(ctx.dutyForDays(1));
	const todayDuty = $derived(dutyDays.find((d) => d.isToday));
	const tomorrowDuty = $derived(dutyDays.find((d) => !d.isToday));

	let changesExpanded = $state(false);
	let outTodayExpanded = $state(false);
	let lossesExpanded = $state(false);

	const visibleChanges = $derived(changesExpanded ? ctx.upcomingChanges : ctx.upcomingChanges.slice(0, CARD_LIMIT));
	const visibleOutToday = $derived(
		outTodayExpanded ? ctx.nonAvailablePersonnel : ctx.nonAvailablePersonnel.slice(0, CARD_LIMIT)
	);
	const LOSSES_LIMIT = 3;
	const visibleLosses = $derived(lossesExpanded ? ctx.upcomingLosses : ctx.upcomingLosses.slice(0, LOSSES_LIMIT));

	interface AttentionItem {
		severity: 'danger' | 'warning' | 'info';
		message: string;
		detail: string;
		count?: number;
	}

	const attentionItems = $derived.by((): AttentionItem[] => {
		const items: AttentionItem[] = [];
		const stats = ctx.trainingStats;
		const ratings = ctx.ratingStats;

		if (stats && stats.expired > 0) {
			items.push({
				severity: 'danger',
				message: `${stats.expired} personnel with expired training`,
				detail: ctx.trainingGroupDelinquencies
					.slice(0, 3)
					.map((g) => `${g.groupName} (${g.count})`)
					.join(', '),
				count: stats.expired
			});
		}

		if (ratings.overdue > 0) {
			items.push({
				severity: 'danger',
				message: `${ratings.overdue} overdue evaluation${ratings.overdue !== 1 ? 's' : ''}`,
				detail: 'Requires immediate attention',
				count: ratings.overdue
			});
		}

		if (stats && stats.warningOrange > 0) {
			items.push({
				severity: 'warning',
				message: `${stats.warningOrange} training items expiring soon`,
				detail: 'Within 30-day warning window',
				count: stats.warningOrange
			});
		}

		if (ratings['due-30'] > 0) {
			items.push({
				severity: 'warning',
				message: `${ratings['due-30']} evaluation${ratings['due-30'] !== 1 ? 's' : ''} due within 30 days`,
				detail: 'Across all groups',
				count: ratings['due-30']
			});
		}

		return items;
	});

	function severityDot(severity: AttentionItem['severity']): string {
		return { danger: 'bg-destructive', warning: 'bg-warning', info: 'bg-info' }[severity];
	}

	function severityText(severity: AttentionItem['severity']): string {
		return { danger: 'text-destructive', warning: 'text-warning-foreground', info: 'text-info-foreground' }[severity];
	}
</script>

<section class="px-3 pb-12 sm:px-4">
	<div class="grid gap-3 py-4 md:grid-cols-2 lg:grid-cols-3">
		<!-- ═══════ LARGE: Strength & Availability (spans 2 cols on lg) ═══════ -->
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

		<!-- ═══════ TALL: Attention Required ═══════ -->
		<Card.Root class="row-span-2 flex flex-col">
			<Card.Header>
				<div class="flex items-center justify-between">
					<Card.Title>Requires Attention</Card.Title>
					{#if attentionItems.length > 0}
						<Badge variant="destructive">{attentionItems.length}</Badge>
					{/if}
				</div>
			</Card.Header>
			<div class="flex flex-1 flex-col divide-y overflow-auto">
				{#if attentionItems.length === 0}
					<div class="flex flex-1 items-center justify-center p-4">
						<p class="font-mono text-xs uppercase tracking-widest text-muted-foreground">No items require attention</p>
					</div>
				{:else}
					{#each attentionItems as item, i (i)}
						<div class="flex items-start gap-3 px-4 py-3">
							<span class="mt-1 size-2 shrink-0 rounded-full {severityDot(item.severity)}"></span>
							<div class="min-w-0 flex-1">
								<div class="text-sm font-medium text-foreground">{item.message}</div>
								{#if item.detail}
									<div class="mt-0.5 font-mono text-[0.625rem] text-muted-foreground">{item.detail}</div>
								{/if}
							</div>
							{#if item.count}
								<span class="shrink-0 font-mono text-xs font-semibold {severityText(item.severity)}">
									{item.count}
								</span>
							{/if}
						</div>
					{/each}
				{/if}

				{#if ctx.upcomingLosses.length > 0}
					<div class="px-4 py-3">
						<div class="mb-2 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
							Upcoming Losses
						</div>
						{#each visibleLosses as loss (loss.personId)}
							<div class="flex items-baseline justify-between gap-2 py-1">
								<span class="min-w-0 truncate text-sm text-foreground">{loss.personName}</span>
								<span class="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
									{ctx.formatShortDate(loss.targetDate)}
								</span>
							</div>
						{/each}
						{#if ctx.upcomingLosses.length > LOSSES_LIMIT}
							<button
								type="button"
								class="mt-1 font-mono text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
								onclick={() => (lossesExpanded = !lossesExpanded)}
							>
								{lossesExpanded ? 'Show less' : `+${ctx.upcomingLosses.length - LOSSES_LIMIT} more`}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</Card.Root>

		<!-- ═══════ MEDIUM: Training & Evaluations ═══════ -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Training & Evaluations</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<div class="font-display text-4xl font-bold" style:color={view.trainingColor}>
							{ctx.trainingCurrencyPct}%
						</div>
						<div class="font-mono text-[0.625rem] text-muted-foreground">training current</div>
					</div>
					<div>
						<div class="font-display text-4xl font-bold text-destructive">{ctx.ratingStats.overdue}</div>
						<div class="font-mono text-[0.625rem] text-muted-foreground">evals overdue</div>
					</div>
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

				{#if ctx.groupBreakdown.length > 0}
					<Separator class="my-3" />
					<div class="grid gap-1.5">
						{#each ctx.groupBreakdown as g (g.id)}
							{@const delinquency = ctx.trainingGroupDelinquencies.find((d) => d.groupName === g.name)}
							<div class="flex items-center gap-2">
								<span class="w-14 truncate font-mono text-[0.625rem] font-semibold uppercase text-muted-foreground">
									{g.name}
								</span>
								<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
									<div class="h-full rounded-full bg-primary" style:width="{g.pct}%"></div>
								</div>
								<span class="w-8 text-right font-mono text-[0.625rem]" style:color={view.availabilityColor(g.pct)}>
									{g.pct}%
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

		<!-- ═══════ MEDIUM: Duty Roster ═══════ -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Duty Roster</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if todayDuty}
					<div class="mb-1 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">Today</div>
					{#if todayDuty.assignments.length === 0}
						<p class="py-2 font-mono text-[0.625rem] text-muted-foreground">No assignments today</p>
					{:else}
						{#each todayDuty.assignments as a (a.id)}
							<div class="flex items-baseline justify-between gap-2 border-t border-border/60 py-1.5">
								<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{a.typeName}</span>
								<span class="text-sm text-foreground">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				{/if}

				{#if tomorrowDuty}
					<div class="mb-1 mt-3 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
						Tomorrow
					</div>
					{#if tomorrowDuty.assignments.length === 0}
						<p class="py-2 font-mono text-[0.625rem] text-muted-foreground">No assignments tomorrow</p>
					{:else}
						{#each tomorrowDuty.assignments as a (a.id)}
							<div class="flex items-baseline justify-between gap-2 border-t border-border/60 py-1.5">
								<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{a.typeName}</span>
								<span class="text-sm text-foreground">{a.assigneeName}</span>
							</div>
						{/each}
					{/if}
				{/if}

				{#if ctx.todayAdvancedDuty.length > 0}
					<Separator class="my-3" />
					{#each ctx.todayAdvancedDuty as event (event.id)}
						<div class="mb-2">
							<div class="mb-1 font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
								{event.templateName}
							</div>
							{#each event.slots as slot (slot.key)}
								<div class="flex items-baseline justify-between gap-2 border-t border-border/60 py-1.5">
									<span class="font-mono text-[0.625rem] uppercase text-muted-foreground">{slot.roleLabel}</span>
									<span class="text-sm text-foreground">{slot.assigneeName}</span>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- ═══════ SMALL: Onboarding ═══════ -->
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
					<p class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">No active onboardings</p>
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

		<!-- ═══════ SMALL: Upcoming Changes ═══════ -->
		<Card.Root>
			<Card.Header>
				<div class="flex items-center justify-between">
					<Card.Title>Upcoming Changes</Card.Title>
					{#if ctx.upcomingChanges.length > 0}
						<Badge variant="secondary">{ctx.upcomingChanges.length}</Badge>
					{/if}
				</div>
			</Card.Header>
			{#if ctx.upcomingChanges.length === 0}
				<Card.Content>
					<p class="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">
						No changes in the next 7 days
					</p>
				</Card.Content>
			{:else}
				<div class="divide-y">
					{#each visibleChanges as change (change.key)}
						<div class="flex items-baseline justify-between gap-2 px-4 py-2">
							<span class="min-w-0 truncate text-sm text-foreground">{change.personName}</span>
							<span class="shrink-0 font-mono text-[0.625rem] text-muted-foreground">
								{ctx.formatShortDate(change.date)} · {change.direction === 'departing'
									? change.statusName
									: 'Returning'}
							</span>
						</div>
					{/each}
					{#if ctx.upcomingChanges.length > CARD_LIMIT}
						<button
							type="button"
							class="w-full px-4 py-2 font-mono text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => (changesExpanded = !changesExpanded)}
						>
							{changesExpanded ? 'Show less' : `+${ctx.upcomingChanges.length - CARD_LIMIT} more`}
						</button>
					{/if}
				</div>
			{/if}
		</Card.Root>

		<!-- ═══════ SMALL: Personnel Out Today ═══════ -->
		{#if ctx.nonAvailablePersonnel.length > 0}
			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between">
						<Card.Title>Out Today</Card.Title>
						<Badge variant="secondary">{ctx.nonAvailablePersonnel.length}</Badge>
					</div>
				</Card.Header>
				<div class="divide-y">
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
					{#if ctx.nonAvailablePersonnel.length > CARD_LIMIT}
						<button
							type="button"
							class="w-full px-4 py-2 font-mono text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => (outTodayExpanded = !outTodayExpanded)}
						>
							{outTodayExpanded ? 'Show less' : `+${ctx.nonAvailablePersonnel.length - CARD_LIMIT} more`}
						</button>
					{/if}
				</div>
			</Card.Root>
		{/if}
	</div>
</section>
