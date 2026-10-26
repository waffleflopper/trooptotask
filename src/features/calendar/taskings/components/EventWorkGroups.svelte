<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import { Badge } from '$lib/components/ui/badge';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { nextTaskingDate, type GroupLabels } from '../taskingModel';
	import type { EventWorkGroup, EventWorkPhase, TaskingSummary } from '../eventWorkModel';
	import TaskingStatusBadges from './TaskingStatusBadges.svelte';
	import { staffingLabel } from '../staffing/staffingModel';
	import { STATUS_BADGES, responsibilityLabel } from './taskingLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		groups: EventWorkGroup[];
		groupLabels: GroupLabels;
	}

	let { org, today, groups, groupLabels }: Props = $props();

	const PHASES: Record<EventWorkPhase, { title: string; hint: string }> = {
		preparation: { title: 'Preparation', hint: 'Due before the event starts' },
		execution: { title: 'Execution', hint: 'Happening or due during the event' },
		closeout: { title: 'Closeout', hint: 'Due after the event ends' }
	};

	const summaryResponsible = (summary: TaskingSummary) =>
		summary.responsibility.kind === 'organization' ? org.orgName : summary.responsibility.name;
</script>

<div class="grid gap-5">
	{#each groups as group (group.phase)}
		<section class="grid gap-2" aria-labelledby={`event-work-${group.phase}`}>
			<div class="flex flex-wrap items-baseline gap-x-3">
				<h3 id={`event-work-${group.phase}`} class="font-heading text-base font-semibold">
					{PHASES[group.phase].title}
				</h3>
				<span class="text-sm text-muted-foreground">{PHASES[group.phase].hint}</span>
			</div>
			<ul class="grid gap-2">
				{#each group.items as item (item.kind === 'full' ? item.tasking.id : item.summary.id)}
					<li>
						{#if item.kind === 'full'}
							{@const tasking = item.tasking}
							{@const next = nextTaskingDate(tasking, today)}
							<a
								href={`/org/${org.orgUrlSegment}/calendar/taskings/${tasking.id}`}
								class="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
							>
								<span class="grid min-w-0 gap-0.5">
									<span class="truncate font-medium text-foreground">{tasking.title}</span>
									<span class="truncate text-sm text-muted-foreground">
										{responsibilityLabel(tasking.responsibility, groupLabels, org.orgName)} · {next.label}
										{formatDayMonthYear(next.on)}
									</span>
								</span>
								<TaskingStatusBadges {tasking} {today} />
							</a>
						{:else}
							{@const summary = item.summary}
							{@const badge = STATUS_BADGES[summary.status]}
							<div
								class="grid gap-1 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
							>
								<span class="grid min-w-0 gap-0.5">
									<span class="truncate font-medium text-foreground">{summary.title}</span>
									<span class="truncate text-sm text-muted-foreground">
										{[
											summaryResponsible(summary),
											`Due ${formatDayMonthYear(summary.suspenseOn)}`,
											staffingLabel(summary.pickedCount, summary.requiredCount)
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</span>
								<span class="flex flex-wrap items-center gap-1.5">
									<Badge variant={badge.variant}>{badge.label}</Badge>
								</span>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
