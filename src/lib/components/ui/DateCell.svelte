<script lang="ts">
	import { Root as DateCellRoot } from '$lib/components/ui/date-cell/index.js';
	import type { DateCellMarker, DateCellStatus } from '$lib/components/ui/date-cell/types.js';
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

	const statuses = $derived<DateCellStatus[]>(
		entries.flatMap((entry) => {
			const status = statusTypeMap.get(entry.statusTypeId);
			return status
				? [
						{
							id: entry.id,
							color: status.color,
							name: status.name,
							textColor: status.textColor,
							note: entry.note ?? undefined
						}
					]
				: [];
		})
	);

	const markers = $derived<DateCellMarker[]>([
		...assignments.map(({ type, assignment }) => ({
			id: assignment.id,
			name: type.name,
			shortName: type.shortName,
			color: type.color,
			textColor: '#ffffff',
			title: type.name,
			kind: 'assignment' as const
		})),
		...dutyBadges.map((badge) => ({
			id: badge.slotId,
			name: badge.title,
			shortName: badge.shortName,
			color: badge.color,
			textColor: badge.textColor,
			title: badge.title,
			kind: 'duty' as const
		}))
	]);

	const tooltipText = $derived.by(() => {
		const parts: string[] = [];
		if (holidayName) {
			parts.push(holidayName);
		}
		parts.push(...markers.map((marker) => marker.title ?? marker.name));
		parts.push(...statuses.map((status) => (status.note ? `${status.name} - ${status.note}` : status.name)));
		return parts.join('\n');
	});
</script>

<DateCellRoot
	weekend={isWeekend}
	today={isToday}
	holiday={isHoliday}
	{holidayName}
	onboarding={isOnboarding}
	{statuses}
	{markers}
	{showStatusText}
	title={tooltipText}
	{onclick}
/>
