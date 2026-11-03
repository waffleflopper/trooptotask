<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';
	import { readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import { formatDayMonth, formatWeekdayDayMonth } from '$lib/utils/dates';
	import { dayOnOrFirst, dominantCauses, type AvailabilityBoard } from '../../utils/availabilityBoard';
	import { readinessTone, type ForecastDay } from '../../utils/calendarReports';

	interface Props {
		board: AvailabilityBoard;
		lowest: ForecastDay;
		statusTypes: readonly StatusType[];
		today: string | null;
	}

	let { board, lowest, statusTypes, today }: Props = $props();

	const TONE = { success: 'good', warning: 'caution', destructive: 'danger' } as const;

	const reference = $derived(dayOnOrFirst(board.days, today));
	const causes = $derived(dominantCauses(lowest));
	const namedShortGroups = $derived(
		board.groupsUnderHalf.length > 0 && board.groupsUnderHalf.length <= 2
			? ` · ${board.groupsUnderHalf.join(', ')}`
			: ''
	);
	const statusName = (id: string) => statusTypes.find((status) => status.id === id)?.name ?? 'Unknown';

	function joinWithAnd(parts: string[]): string {
		return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
	}

	const sentence = $derived.by(() => {
		if (lowest.unavailableCount === 0) return 'Everyone is here on every day in this range.';
		const parts = [
			...causes.top.map((cause) => `${cause.count} on ${statusName(cause.statusTypeId)}`),
			...(causes.otherCount > 0 ? [`${causes.otherCount} on other statuses`] : [])
		];
		const away = lowest.unavailableCount;
		return `${formatWeekdayDayMonth(lowest.date)} is the lowest day. ${away} ${away === 1 ? 'is' : 'are'} away: ${joinWithAnd(parts)}.`;
	});
</script>

<div class="flex flex-wrap items-end gap-x-5 gap-y-3">
	<div>
		<p
			class={[
				'font-heading text-[104px] leading-[88px] font-extrabold tracking-[-0.02em]',
				readinessBandTone[TONE[readinessTone(lowest)]]
			]}
		>
			{lowest.availablePercent}%
		</p>
		<p class="mt-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Lowest day in range</p>
	</div>
	<div>
		<p class="font-heading text-[28px] leading-8 font-bold uppercase">{formatWeekdayDayMonth(lowest.date)}</p>
		<p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
			{lowest.availableCount} of {lowest.totalPersonnel} here
		</p>
	</div>
</div>
<p class="mt-6 font-serif text-[17px] leading-[26px]">{sentence}</p>
<dl class="mt-6 border-t border-border text-sm" aria-label="Availability facts">
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>{reference?.date === today ? 'Here today' : `Here on ${formatDayMonth(reference?.date ?? lowest.date)}`}</dt>
		<dd class="font-mono font-semibold">
			{reference?.availableCount ?? 0} · {reference?.availablePercent ?? 0}%
		</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Days under 80%</dt>
		<dd class={['font-mono font-semibold', board.daysUnderTarget > 0 && 'text-warning-foreground']}>
			{board.daysUnderTarget} of {board.days.length}
		</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Groups under 50% on any day</dt>
		<dd class={['text-right font-mono font-semibold', board.groupsUnderHalf.length > 0 && 'text-danger-foreground']}>
			{board.groupsUnderHalf.length}{namedShortGroups}
		</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Away on {formatDayMonth(lowest.date)}</dt>
		<dd class="font-mono font-semibold">{lowest.unavailableCount}</dd>
	</div>
</dl>
