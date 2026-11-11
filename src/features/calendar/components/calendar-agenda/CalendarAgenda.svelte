<script lang="ts">
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { AvailabilityEntry } from '$features/calendar/contracts';
	import type { Personnel } from '$features/personnel/contracts';
	import type { AgendaDay, AgendaDuty, AgendaPerson } from '$features/calendar/utils/calendarAgenda';
	import type { CalendarSpan } from '$features/calendar/utils/calendarBars';
	import { availabilityEntryLabel } from '$features/calendar/utils/availabilityLabels';
	import { CALENDAR_DATE_LABEL } from '$features/calendar/utils/calendarRenderState';
	import { formatWeekdayDayMonth } from '$lib/utils/dates';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import AssignmentCodeChip from '../AssignmentCodeChip.svelte';
	import { CalendarStatusBadge } from '../calendar-status-badge';
	import AgendaDayCard from './AgendaDayCard.svelte';

	interface Props {
		days: readonly AgendaDay[];
		personnelHref?: string;
		/** Without it, a duty is plain text, as a row marker is for a reader who cannot edit assignments. */
		onDutyClick?: (date: Date) => void;
		onOpenEntry?: (person: Personnel, entry: AvailabilityEntry, anchor: HTMLElement) => void;
		popoverEntry?: { personId: string; entryId: string } | null;
	}

	let { days, personnelHref, onDutyClick, onOpenEntry, popoverEntry = null }: Props = $props();

	const label = (person: Personnel) => `${person.rank} ${person.lastName}, ${person.firstName}`;

	function statusLabel(span: CalendarSpan): string {
		return availabilityEntryLabel(span.entry, new Map([[span.status.id, span.status.name]]));
	}

	function dutyLabel(entry: AgendaPerson, duty: AgendaDuty, day: AgendaDay): string {
		const base = `${duty.type.name} for ${CALENDAR_DATE_LABEL.format(day.date)}: ${label(entry.person)}`;
		return duty.conflict ? `${base}, unavailable: ${duty.conflict}` : base;
	}
</script>

{#if days[0]?.total === 0}
	<Empty.Root class="min-h-52 rounded-lg border bg-card">
		<Empty.Header>
			<Empty.Title level={3}>No personnel added yet</Empty.Title>
			<Empty.Description>Go to Personnel to add people to your roster.</Empty.Description>
		</Empty.Header>
		{#if personnelHref}
			<Empty.Content>
				<Button href={personnelHref} size="sm">Go to Personnel</Button>
			</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<div
		class="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
		data-testid="calendar-agenda"
	>
		<ol class="mx-auto flex w-full max-w-3xl flex-col gap-3">
			{#each days as day (day.dateKey)}
				<li data-date={day.dateKey}>
					<AgendaDayCard today={day.today}>
						{#snippet header()}
							<h3 class="font-display text-sm font-bold text-foreground">{formatWeekdayDayMonth(day.dateKey)}</h3>
							{#if day.today}
								<Badge mono>Today</Badge>
							{/if}
							{#if day.specialDay}
								<Badge variant="warning" class="min-w-0 truncate">{day.specialDay.name}</Badge>
							{/if}
							<span class="ml-auto shrink-0 text-xs text-muted-foreground">
								<span class="font-semibold text-foreground">{day.available}</span> available
							</span>
						{/snippet}
						{#if day.people.length === 0}
							<p class="px-3 py-2.5 text-sm text-muted-foreground">No one out or on duty.</p>
						{:else}
							<ul class="divide-y">
								{#each day.people as entry (entry.person.id)}
									<li
										class="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-4"
										data-person-id={entry.person.id}
									>
										<span class="flex min-w-0 items-baseline gap-2 sm:w-52 sm:shrink-0">
											<span
												class="min-w-8 shrink-0 font-mono text-xs font-semibold tracking-wider text-primary uppercase"
											>
												{entry.person.rank}
											</span>
											<span class="truncate text-sm font-semibold text-foreground">
												{entry.person.lastName}, {entry.person.firstName}
											</span>
										</span>
										<span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
											{#each entry.statuses as span (span.entry.id)}
												{@const selected =
													popoverEntry?.personId === entry.person.id && popoverEntry.entryId === span.entry.id}
												<Button
													variant="ghost"
													size="none"
													class={['h-auto rounded-md p-0', selected && 'ring-2 ring-foreground ring-offset-1']}
													aria-label={`${label(entry.person)}, ${statusLabel(span)}`}
													aria-haspopup="dialog"
													aria-expanded={selected}
													data-entry-id={span.entry.id}
													onclick={(event) => onOpenEntry?.(entry.person, span.entry, event.currentTarget)}
												>
													<CalendarStatusBadge statusType={span.status}>{statusLabel(span)}</CalendarStatusBadge>
												</Button>
											{/each}
											{#each entry.duties as duty (duty.assignment.id)}
												{#snippet dutyContent()}
													<AssignmentCodeChip code={duty.type.shortName} color={duty.type.color} size="row" />
													<span class="text-sm text-foreground">{duty.type.name}</span>
													{#if duty.conflict}
														<TriangleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
														<span class="min-w-0 text-xs">Unavailable: {duty.conflict}</span>
													{/if}
												{/snippet}
												{#if onDutyClick}
													<Button
														variant="ghost"
														size="xs"
														class={[
															'h-auto min-h-6 max-w-full flex-wrap justify-start gap-1.5 py-0.5 whitespace-normal',
															duty.conflict && 'bg-destructive/10 text-destructive-text'
														]}
														aria-label={`${dutyLabel(entry, duty, day)}. Edit assignments`}
														data-assignment-id={duty.assignment.id}
														onclick={() => onDutyClick(day.date)}
													>
														{@render dutyContent()}
													</Button>
												{:else}
													<span
														class={[
															'flex max-w-full flex-wrap items-center gap-1.5 rounded-md px-2 py-0.5',
															duty.conflict && 'bg-destructive/10 text-destructive-text'
														]}
														data-assignment-id={duty.assignment.id}
													>
														{@render dutyContent()}
													</span>
												{/if}
											{/each}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</AgendaDayCard>
				</li>
			{/each}
		</ol>
	</div>
{/if}
