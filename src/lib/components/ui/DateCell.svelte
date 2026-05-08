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
	class={[
		'date-cell relative flex h-full min-w-0 cursor-pointer items-start justify-center overflow-hidden border-r border-b bg-transparent pt-0.5 transition-[background-color,box-shadow,filter] hover:shadow-[inset_0_0_0_1px_var(--primary)] focus-visible:ring-ring focus-visible:z-[2] focus-visible:ring-2 focus-visible:outline-none max-sm:min-w-[var(--cell-width)]',
		isWeekend && 'bg-muted/55',
		isHoliday && 'bg-warning-muted/50',
		isToday && 'z-[1] shadow-[inset_0_0_0_1px_var(--primary)]',
		statusColors.length === 0 && 'hover:bg-primary/5',
		statusColors.length > 0 && 'has-status hover:brightness-95',
		(assignments.length > 0 || dutyBadges.length > 0) && 'has-assignment shadow-[inset_0_0_0_1px_var(--primary)]'
	]}
	style:background={getBackground()}
	title={tooltipText}
	{onclick}
>
	{#if assignments.length > 0 || dutyBadges.length > 0}
		<div class="flex flex-wrap justify-center gap-px">
			{#each assignments as { type, assignment } (assignment.id)}
				<span
					class="assignment-badge rounded-[2px] px-0.5 py-px font-mono text-[6px] leading-none font-semibold tracking-wider text-white uppercase sm:text-[7px]"
					style="background-color: {type.color}"
				>
					{type.shortName}
				</span>
			{/each}
			{#each dutyBadges as badge (badge.slotId)}
				<span
					class="assignment-badge duty-badge rounded-[2px] px-0.5 py-px font-mono text-[6px] leading-none font-semibold tracking-wider uppercase shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] sm:text-[7px]"
					style="background-color: {badge.color}; color: {badge.textColor};"
				>
					{badge.shortName}
				</span>
			{/each}
		</div>
	{/if}
	{#if showStatusText && statusColors.length > 0}
		<span
			class="max-w-full overflow-hidden px-0.5 font-mono text-[8px] leading-tight font-semibold tracking-wider text-ellipsis whitespace-nowrap uppercase"
			style="color: {statusColors[0].textColor}">{statusColors.map((s) => s.name).join(', ')}</span
		>
	{:else if statusColors.length > 1}
		<span
			class="absolute right-px bottom-px rounded-[2px] bg-foreground/80 px-0.5 font-mono text-[8px] leading-tight text-background sm:text-[9px]"
		>
			{statusColors.length}
		</span>
	{/if}
</button>
