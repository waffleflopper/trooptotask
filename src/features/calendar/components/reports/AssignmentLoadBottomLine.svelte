<script lang="ts">
	import { formatDayMonth } from '$lib/utils/dates';
	import { ON_SHARE_BAND, OVER_FLAG, type AssignmentLoadReport } from '../../utils/assignmentLoad';

	interface Props {
		report: AssignmentLoadReport;
		start: string;
		end: string;
	}

	let { report, start, end }: Props = $props();

	const { summary } = $derived(report);
	const duties = (value: number) => value.toFixed(1);
	const nameOf = ({ person }: { person: { rank: string; lastName: string } }) => `${person.rank} ${person.lastName}`;

	const sentence = $derived.by(() => {
		const { heaviest, owedMost, never } = summary;
		const carries = heaviest
			? `${nameOf(heaviest)} carries the most, ${duties(heaviest.difference)} over a fair share of ${duties(heaviest.expected)}. `
			: 'Nobody is over their fair share. ';
		if (never === 0 || !owedMost) return `${carries}Everyone eligible drew at least one duty.`;
		if (never === 1) return `${carries}${nameOf(owedMost)} drew nothing and was owed ${duties(owedMost.expected)}.`;
		return `${carries}${never} eligible people drew nothing, and ${nameOf(owedMost)} was owed the most at ${duties(owedMost.expected)}.`;
	});
</script>

<div>
	<p class="font-heading text-[104px] leading-[88px] font-extrabold tracking-[-0.02em]">
		{summary.onShareFraction === null ? '—' : `${Math.round(summary.onShareFraction * 100)}%`}
	</p>
	<p class="mt-2 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">On their fair share</p>
	<p class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
		{summary.onShare} of {summary.eligible} within {ON_SHARE_BAND} duty
	</p>
	<p class="mt-1 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
		{formatDayMonth(start)} to {formatDayMonth(end)} · {report.spanDays} days
	</p>
</div>
<p class="mt-6 font-serif text-[17px] leading-[26px]">{sentence}</p>
<dl class="mt-6 border-t border-border text-sm" aria-label="Assignment load facts">
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Duties in range</dt>
		<dd class="font-mono font-semibold">{summary.duties.toLocaleString('en-US')}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Eligible people</dt>
		<dd class="font-mono font-semibold">{summary.eligible.toLocaleString('en-US')}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>Never assigned</dt>
		<dd class={['font-mono font-semibold', summary.never > 0 && 'text-warning-foreground']}>{summary.never}</dd>
	</div>
	<div class="flex min-h-9 items-center justify-between gap-3 border-b border-border">
		<dt>{OVER_FLAG}+ over fair share</dt>
		<dd class={['font-mono font-semibold', summary.overFlagged > 0 && 'text-warning-foreground']}>
			{summary.overFlagged}
		</dd>
	</div>
</dl>
