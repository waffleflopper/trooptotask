<script lang="ts">
	import type { AvailabilityEntry, StatusType } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';

	interface Props {
		date: Date;
		isWeekend: boolean;
		isToday: boolean;
		isHoliday: boolean;
		holidayName?: string;
		entries: AvailabilityEntry[];
		statusTypes: StatusType[];
		assignments?: { type: AssignmentType; assignment: DailyAssignment }[];
		onclick?: () => void;
	}

	let {
		date,
		isWeekend,
		isToday,
		isHoliday,
		holidayName,
		entries,
		statusTypes,
		assignments = [],
		onclick
	}: Props = $props();

	const statusColors = $derived(
		entries
			.map((entry) => {
				const status = statusTypes.find((s) => s.id === entry.statusTypeId);
				return status ? { color: status.color, name: status.name } : null;
			})
			.filter((s): s is { color: string; name: string } => s !== null)
	);

	const tooltipText = $derived(() => {
		const parts: string[] = [];
		if (assignments.length > 0) {
			parts.push(...assignments.map((a) => a.type.name));
		}
		if (holidayName) {
			parts.push(holidayName);
		}
		if (statusColors.length > 0) {
			parts.push(...statusColors.map((s) => s.name));
		}
		return parts.join('\n');
	});

	function getBackground(): string {
		if (statusColors.length === 0) {
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
	title={tooltipText()}
	onclick={onclick}
>
	{#if assignments.length > 0}
		<div class="assignment-badges">
			{#each assignments as { type }}
				<span class="assignment-badge" style="background-color: {type.color}">{type.shortName}</span>
			{/each}
		</div>
	{/if}
	{#if statusColors.length > 1}
		<span class="multi-indicator">{statusColors.length}</span>
	{/if}
</button>

<style>
	.date-cell {
		flex: 1;
		height: var(--cell-height);
		min-width: var(--cell-width);
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
		opacity: 0.8;
		box-shadow: inset 0 0 0 2px var(--color-primary);
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
		border: 2px solid;
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
