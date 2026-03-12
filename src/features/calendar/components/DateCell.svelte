<script lang="ts">
	import type { AvailabilityEntry, StatusType } from '$features/calendar/calendar.types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';

	interface Props {
		date: Date;
		isWeekend: boolean;
		isToday: boolean;
		isHoliday: boolean;
		holidayName?: string;
		entries: AvailabilityEntry[];
		statusTypeMap: Map<string, StatusType>;
		assignments?: { type: AssignmentType; assignment: DailyAssignment }[];
		showStatusText?: boolean;
		isOnboarding?: boolean;
		onclick?: () => void;
	}

	let {
		date,
		isWeekend,
		isToday,
		isHoliday,
		holidayName,
		entries,
		statusTypeMap,
		assignments = [],
		showStatusText = false,
		isOnboarding = false,
		onclick
	}: Props = $props();

	const statusColors = $derived(
		entries
			.flatMap((entry) => {
				const status = statusTypeMap.get(entry.statusTypeId);
				return status ? [{ color: status.color, name: status.name, textColor: status.textColor, note: entry.note }] : [];
			})
	);

	const tooltipText = $derived.by(() => {
		const parts: string[] = [];
		if (assignments.length > 0) {
			parts.push(...assignments.map((a) => a.type.name));
		}
		if (holidayName) {
			parts.push(holidayName);
		}
		if (statusColors.length > 0) {
			parts.push(...statusColors.map((s) => s.note ? `${s.name} — ${s.note}` : s.name));
		}
		return parts.join('\n');
	});

	function getBackground(): string {
		if (statusColors.length === 0) {
			if (isOnboarding) {
				return 'var(--color-onboarding-tint)';
			}
			return '';
		}
		if (statusColors.length === 1) {
			return statusColors[0].color;
		}
		// Multiple statuses - create diagonal stripes
		const stripeWidth = 100 / statusColors.length;
		const gradientStops = statusColors
			.map((s, i) => {
				const start = i * stripeWidth;
				const end = (i + 1) * stripeWidth;
				return `${s.color} ${start}%, ${s.color} ${end}%`;
			})
			.join(', ');
		return `repeating-linear-gradient(45deg, ${gradientStops})`;
	}
</script>

<button
	class="date-cell"
	class:weekend={isWeekend}
	class:today={isToday}
	class:holiday={isHoliday}
	class:has-status={statusColors.length > 0}
	class:has-assignment={assignments.length > 0}
	style:background={getBackground()}
	title={tooltipText}
	onclick={onclick}
>
	{#if assignments.length > 0}
		<div class="assignment-badges">
			{#each assignments as { type }}
				<span class="assignment-badge" style="background-color: {type.color}">{type.shortName}</span>
			{/each}
		</div>
	{/if}
	{#if showStatusText && statusColors.length > 0}
		<span class="status-text" style="color: {statusColors[0].textColor}">{statusColors.map(s => s.name).join(', ')}</span>
	{:else if statusColors.length > 1}
		<span class="multi-indicator">{statusColors.length}</span>
	{/if}
</button>

<style>
	.date-cell {
		flex: 1 1 0;
		width: 0; /* Force flex-basis behavior */
		min-height: var(--cell-height);
		min-width: var(--cell-width);
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-left: none;
		cursor: pointer;
		position: relative;
		transition: all 0.1s ease;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 2px;
	}

	.date-cell:hover {
		box-shadow: inset 0 0 0 2px var(--color-primary);
	}

	.date-cell:not(.has-status):hover {
		background-color: rgba(var(--color-primary-rgb), 0.06);
	}

	.date-cell.has-status:hover {
		filter: brightness(0.92);
	}

	.weekend {
		background-color: var(--color-weekend);
	}

	.holiday {
		background-color: var(--color-holiday);
	}

	.today {
		box-shadow: inset 0 0 0 2px var(--color-today-border);
		z-index: 1;
	}

	.has-status.today {
		box-shadow: inset 0 0 0 2px var(--color-today-border);
	}

	.has-assignment {
		box-shadow: inset 0 0 0 2px var(--color-primary);
	}

	.assignment-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 1px;
		justify-content: center;
	}

	.assignment-badge {
		font-size: 7px;
		font-weight: 700;
		color: white;
		padding: 1px 2px;
		border-radius: 2px;
		line-height: 1;
	}

	.multi-indicator {
		position: absolute;
		bottom: 1px;
		right: 1px;
		font-size: 9px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		border-radius: 2px;
		padding: 0 3px;
		line-height: 1.2;
	}

	.status-text {
		font-size: 8px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
		padding: 0 2px;
		line-height: 1.1;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.date-cell {
			min-width: var(--cell-width);
			min-height: var(--cell-height);
		}

		.assignment-badge {
			font-size: 6px;
			padding: 0 1px;
		}

		.multi-indicator {
			font-size: 8px;
			padding: 0 2px;
		}
	}
</style>
