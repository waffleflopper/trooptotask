<script lang="ts">
	import type {
		Personnel,
		AvailabilityEntry,
		StatusType,
		SpecialDay,
		AssignmentType,
		DailyAssignment
	} from '$lib/types';
	import type { DutyEventBadge } from '$features/calendar/utils/dutyEventBadges';
	import type { UpcomingLossRecord } from '$features/dashboard/utils/evaluateUpcomingLosses';
	import { isWeekend, isToday, formatDate } from '$lib/utils/dates';
	import DateCell from '$lib/components/ui/DateCell.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		person: Personnel;
		dates: Date[];
		personAvailability: AvailabilityEntry[];
		statusTypeMap: Map<string, StatusType>;
		specialDays: SpecialDay[];
		assignmentTypes: AssignmentType[];
		personAssignments: DailyAssignment[];
		personDutyBadges?: Map<string, DutyEventBadge[]>;
		showStatusText?: boolean;
		showPersonnelRoles?: boolean;
		isOnboarding?: boolean;
		highlightOnboarding?: boolean;
		/** Upcoming-loss record for this person, if they are approaching ETS or PCS/DEROS. */
		upcomingLossRecord?: UpcomingLossRecord;
		onCellClick?: (person: Personnel, date: Date) => void;
		onPersonClick?: (person: Personnel) => void;
	}

	let {
		person,
		dates,
		personAvailability,
		statusTypeMap,
		specialDays,
		assignmentTypes,
		personAssignments,
		personDutyBadges,
		showStatusText = false,
		showPersonnelRoles = false,
		isOnboarding = false,
		highlightOnboarding = true,
		upcomingLossRecord,
		onCellClick,
		onPersonClick
	}: Props = $props();

	// Build date-keyed index of availability entries for this person (once per render)
	const availabilityByDate = $derived.by(() => {
		const map = new SvelteMap<string, AvailabilityEntry[]>();
		for (const entry of personAvailability) {
			// Expand entry across its date range for the visible dates
			for (const date of dates) {
				const dateStr = formatDate(date);
				if (dateStr >= entry.startDate && dateStr <= entry.endDate) {
					let list = map.get(dateStr);
					if (!list) {
						list = [];
						map.set(dateStr, list);
					}
					list.push(entry);
				}
			}
		}
		return map;
	});

	// Build date-keyed index of assignments for this person
	const assignmentsByDate = $derived.by(() => {
		const map = new SvelteMap<string, { type: AssignmentType; assignment: DailyAssignment }[]>();
		for (const a of personAssignments) {
			const type = assignmentTypes.find((t) => t.id === a.assignmentTypeId && t.assignTo === 'personnel');
			if (!type) continue;
			let list = map.get(a.date);
			if (!list) {
				list = [];
				map.set(a.date, list);
			}
			list.push({ type, assignment: a });
		}
		return map;
	});

	// Build date-keyed index of special days
	const specialDayMap = $derived.by(() => {
		const map = new SvelteMap<string, SpecialDay>();
		for (const d of specialDays) {
			map.set(d.date, d);
		}
		return map;
	});

	function handleCellClick(date: Date) {
		onCellClick?.(person, date);
	}

	function handlePersonClick() {
		onPersonClick?.(person);
	}
</script>

<div class="personnel-row">
	<button class="personnel-info" class:compact={!showPersonnelRoles} onclick={handlePersonClick}>
		<span class="rank">{person.rank}</span>
		<div class="name-block">
			<span class="name-line">
				<span class="name">{person.lastName}, {person.firstName}</span>
				{#if isOnboarding}
					<span class="onboarding-dot" title="Active onboarding"></span>
				{/if}
				{#if upcomingLossRecord}
					<span
						class="loss-chip"
						class:loss-chip--ets={upcomingLossRecord.triggerType === 'ETS'}
						data-testid="loss-indicator-{person.id}"
						title="{upcomingLossRecord.triggerType} in {upcomingLossRecord.daysRemaining} day{upcomingLossRecord.daysRemaining ===
						1
							? ''
							: 's'}">{upcomingLossRecord.triggerType === 'ETS' ? 'ETS' : 'PCS'}</span
					>
				{/if}
			</span>
			{#if showPersonnelRoles && person.clinicRole}
				<span class="role">{person.clinicRole}</span>
			{/if}
		</div>
	</button>
	{#each dates as date (formatDate(date))}
		{@const dateStr = formatDate(date)}
		{@const specialDay = specialDayMap.get(dateStr)}
		<DateCell
			{date}
			isWeekend={isWeekend(date)}
			isToday={isToday(date)}
			isHoliday={!!specialDay}
			holidayName={specialDay?.name}
			entries={availabilityByDate.get(dateStr) ?? []}
			{statusTypeMap}
			assignments={assignmentsByDate.get(dateStr) ?? []}
			dutyBadges={personDutyBadges?.get(dateStr) ?? []}
			{showStatusText}
			isOnboarding={isOnboarding && highlightOnboarding}
			onclick={() => handleCellClick(date)}
		/>
	{/each}
</div>

<style>
	.personnel-row {
		display: grid;
		grid-template-columns: var(--personnel-column-width) repeat(var(--dates-count), minmax(var(--cell-width), 1fr));
		width: 100%;
		min-width: calc(var(--personnel-column-width) + (var(--cell-width) * var(--dates-count)));
		align-items: stretch;
	}

	.personnel-row:last-child .personnel-info {
		border-bottom: none;
	}

	.personnel-info {
		appearance: none;
		border: none;
		min-height: var(--cell-height);
		padding: 5px var(--sp-3);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		background: var(--surface-panel);
		border-right: var(--border-thin);
		border-bottom: var(--border-thin);
		position: sticky;
		left: 0;
		z-index: 3;
		text-align: left;
		cursor: pointer;
	}

	.personnel-row:last-child :global(.date-cell) {
		border-bottom: none;
	}

	.personnel-info:hover {
		background-color: var(--surface-subtle);
	}

	.personnel-info:hover .name {
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: var(--ink-35);
	}

	.personnel-info.compact {
		padding-top: 4px;
		padding-bottom: 4px;
	}

	.rank {
		min-width: 42px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.name-block {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		min-width: 0;
	}

	.personnel-info.compact .name-block {
		justify-content: center;
	}

	.name-line {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-primary);
	}

	.onboarding-dot {
		width: 8px;
		height: 8px;
		border-radius: 1px;
		background: var(--amber);
		flex-shrink: 0;
	}

	/* ── Upcoming-loss chip ──────────────────────────────────────────────────
	   Lightweight row-header signal for personnel approaching ETS or PCS/DEROS.
	   Mirrors the trigger-chip styling from UpcomingLossesWidget and
	   PersonnelPageView for cross-surface consistency.  Kept intentionally
	   small so the calendar row header stays scannable.
	──────────────────────────────────────────────────────────────────────── */
	.loss-chip {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		padding: 1px 4px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
		line-height: 1.4;
		/* PCS / DEROS default: neutral tint */
		background: var(--ink-06);
		color: var(--text-secondary);
	}

	/* ETS: amber-tinted to flag impending separation */
	.loss-chip--ets {
		background: color-mix(in srgb, var(--amber-light) 80%, var(--surface-panel) 20%);
		color: var(--amber-dark);
	}

	.role {
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.personnel-info {
			padding: 6px var(--sp-2);
		}

		.rank {
			min-width: 34px;
		}

		.name {
			font-size: var(--text-xs);
		}

		.role {
			display: none; /* Hide on mobile to save space */
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.role {
			font-size: 9px;
		}
	}
</style>
