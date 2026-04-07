<script lang="ts">
	import type { AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';
	import type { DutyEventBadge } from '$features/calendar/utils/dutyEventBadges';

	interface Props {
		date: Date;
		isWeekend: boolean;
		isToday: boolean;
		isHoliday: boolean;
		holidayName?: string;
		entries: AvailabilityEntry[];
		statusTypeMap: Map<string, StatusType>;
		assignments?: { type: AssignmentType; assignment: DailyAssignment }[];
		dutyBadges?: DutyEventBadge[];
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
		dutyBadges = [],
		showStatusText = false,
		isOnboarding = false,
		onclick
	}: Props = $props();

	const statusColors = $derived(
		entries.flatMap((entry) => {
			const status = statusTypeMap.get(entry.statusTypeId);
			return status ? [{ color: status.color, name: status.name, textColor: status.textColor, note: entry.note }] : [];
		})
	);

	const tooltipText = $derived.by(() => {
		const parts: string[] = [];
		if (assignments.length > 0) {
			parts.push(...assignments.map((a) => a.type.name));
		}
		if (dutyBadges.length > 0) {
			parts.push(...dutyBadges.map((b) => b.title));
		}
		if (holidayName) {
			parts.push(holidayName);
		}
		if (statusColors.length > 0) {
			parts.push(...statusColors.map((s) => (s.note ? `${s.name} — ${s.note}` : s.name)));
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
	class:has-assignment={assignments.length > 0 || dutyBadges.length > 0}
	style:background={getBackground()}
	title={tooltipText}
	{onclick}
>
	{#if assignments.length > 0 || dutyBadges.length > 0}
		<div class="assignment-badges">
			{#each assignments as { type }}
				<span class="assignment-badge" style="background-color: {type.color}">{type.shortName}</span>
			{/each}
			{#each dutyBadges as badge (badge.slotId)}
				<span class="assignment-badge duty-badge" style="background-color: {badge.color}; color: {badge.textColor};">
					{badge.shortName}
				</span>
			{/each}
		</div>
	{/if}
	{#if showStatusText && statusColors.length > 0}
		<span class="status-text" style="color: {statusColors[0].textColor}"
			>{statusColors.map((s) => s.name).join(', ')}</span
		>
	{:else if statusColors.length > 1}
		<span class="multi-indicator">{statusColors.length}</span>
	{/if}
</button>

<style>
	.date-cell {
		appearance: none;
		border: none;
		background-color: transparent;
		min-height: var(--cell-height);
		min-width: 0;
		overflow: hidden;
		border-right: var(--border-thin);
		border-bottom: var(--border-thin);
		cursor: pointer;
		position: relative;
		transition:
			background-color var(--transition-fast),
			box-shadow var(--transition-fast),
			filter var(--transition-fast);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 2px;
	}

	.date-cell:hover {
		box-shadow: inset 0 0 0 1px var(--amber);
	}

	.date-cell:not(.has-status):hover {
		background-color: rgba(var(--amber-rgb), 0.06);
	}

	.date-cell.has-status:hover {
		filter: brightness(0.96);
	}

	.weekend {
		background-color: var(--color-weekend);
	}

	.holiday {
		background-color: var(--color-holiday);
	}

	.today {
		box-shadow: inset 0 0 0 1px var(--color-today-border);
		z-index: 1;
	}

	.has-status.today {
		box-shadow: inset 0 0 0 1px var(--color-today-border);
	}

	.has-assignment {
		box-shadow: inset 0 0 0 1px var(--amber);
	}

	.assignment-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 1px;
		justify-content: center;
	}

	.assignment-badge {
		font-family: var(--font-mono);
		font-size: 7px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: white;
		padding: 1px 2px;
		border-radius: 2px;
		line-height: 1;
	}

	.duty-badge {
		/* Subtle ring to distinguish advanced-duty badges from assignment-type badges
		   while keeping them in the same row with identical dimensions. */
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
	}

	.multi-indicator {
		position: absolute;
		bottom: 1px;
		right: 1px;
		font-family: var(--font-mono);
		font-size: 9px;
		background: rgba(14, 14, 13, 0.78);
		color: var(--paper);
		border-radius: 2px;
		padding: 0 3px;
		line-height: 1.2;
	}

	.status-text {
		font-family: var(--font-mono);
		font-size: 8px;
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
