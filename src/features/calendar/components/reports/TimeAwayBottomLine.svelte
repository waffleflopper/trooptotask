<script lang="ts">
	import type { StatusType } from '$features/calendar/contracts';
	import { formatDayMonth } from '$lib/utils/dates';
	import { NEXT_OUT_WINDOW_DAYS, type TimeAwayReport, type TimeAwaySummary } from '../../utils/timeAway';

	interface Props {
		report: TimeAwayReport;
		summary: TimeAwaySummary;
		flag: number;
		statusTypes: readonly StatusType[];
		start: string;
		end: string;
	}

	let { report, summary, flag, statusTypes, start, end }: Props = $props();

	const count = (value: number) => value.toLocaleString('en-US');
	const perPerson = (value: number) => value.toFixed(1);
	const statusName = (id: string) => statusTypes.find((status) => status.id === id)?.name ?? 'Unknown';

	const largest = $derived(report.byStatus[0] ?? null);
	const sentence = $derived.by(() => {
		if (report.awayDays === 0) return 'Nobody was away in this span.';
		const busiest = summary.busiestGroup;
		const heaviest = busiest
			? `${busiest.label} carries the heaviest tempo, at ${perPerson(busiest.perPerson)} days away per person. `
			: '';
		const { flagged, flaggedOutAgain } = summary;
		if (flagged === 0) return `${heaviest}Nobody was away ${flag} or more days.`;
		const who = `${flagged} ${flagged === 1 ? 'person was' : 'people were'} away ${flag} or more days`;
		const again =
			flaggedOutAgain > 0
				? `, and ${flaggedOutAgain} of them ${flaggedOutAgain === 1 ? 'is' : 'are'} out again within ${NEXT_OUT_WINDOW_DAYS} days`
				: '';
		return `${heaviest}${who}${again}.`;
	});
</script>

<div>
	<p class="font-heading text-[104px] leading-[88px] font-extrabold tracking-[-0.02em]">
		{Math.round(report.awayShare * 100)}%
	</p>
	<p class="mt-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Days away</p>
	<p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
		{count(report.awayDays)} of {count(report.personDays)} person-days
	</p>
	<p class="mt-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
		{formatDayMonth(start)} to {formatDayMonth(end)} · {report.spanDays} days
	</p>
</div>
<p class="mt-6 min-h-[52px] font-serif text-[17px] leading-[26px]">{sentence}</p>
<dl class="mt-6 border-t border-border text-sm" aria-label="Time away facts">
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>{flag}+ days away</dt>
		<dd class={['font-mono font-semibold', summary.flagged > 0 && 'text-warning-foreground']}>{summary.flagged}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Never away</dt>
		<dd class="font-mono font-semibold">{report.neverAway}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>{largest ? `${statusName(largest.statusTypeId)} share of days` : 'Largest status share'}</dt>
		<dd class="font-mono font-semibold">{largest ? `${Math.round(largest.share * 100)}%` : 'None'}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Busiest group</dt>
		<dd class="text-right font-mono font-semibold">
			{summary.busiestGroup ? `${summary.busiestGroup.label} · ${perPerson(summary.busiestGroup.perPerson)} d` : '—'}
		</dd>
	</div>
</dl>
