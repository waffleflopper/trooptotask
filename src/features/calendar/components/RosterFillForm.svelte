<script lang="ts">
	import { untrack } from 'svelte';
	import type { RosterFillPick, RosterFillPreview } from '$features/calendar/contracts';
	import type { Personnel } from '$features/personnel/contracts';
	import { parseDate } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Skeleton } from '$lib/components/ui/skeleton';

	interface Props {
		typeId: string;
		/** The month's days a fill may start on, today or later. */
		days: readonly string[];
		defaultFrom: string;
		busy: boolean;
		personById: ReadonlyMap<string, Personnel>;
		openDays: (from: string, through: string) => number;
		preview: (from: string, through: string) => Promise<RosterFillPreview>;
		commit: (from: string, through: string, picks: RosterFillPick[]) => Promise<'saved' | 'changed' | 'failed'>;
		onClose: () => void;
		onClearMonth: () => void;
	}

	let { typeId, days, defaultFrom, busy, personById, openDays, preview, commit, onClose, onClearMonth }: Props =
		$props();

	const PREVIEW_ROWS = 5;
	const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
	const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

	// svelte-ignore state_referenced_locally
	let from = $state(defaultFrom);
	// svelte-ignore state_referenced_locally
	let through = $state(days[days.length - 1]);
	let plan = $state<
		{ status: 'loading' } | { status: 'ready'; preview: RosterFillPreview } | { status: 'error'; message: string }
	>({ status: 'loading' });
	let notice = $state<string | null>(null);
	let expanded = $state(false);
	let committing = $state(false);
	let serial = 0;
	let planToken = $state(0);

	const throughDays = $derived(days.filter((day) => day >= from));
	const open = $derived(openDays(from, through));
	const picks = $derived(plan.status === 'ready' ? plan.preview.picks : []);
	const shownPicks = $derived(expanded ? picks : picks.slice(0, PREVIEW_ROWS));
	const fillLabel = $derived(`Fill ${picks.length} ${picks.length === 1 ? 'day' : 'days'}`);
	const locked = $derived(busy || committing);

	$effect(() => {
		const request = { from, through, token: planToken };
		const mine = ++serial;
		plan = { status: 'loading' };
		expanded = false;
		// The parent rebuilds `preview` whenever assignments change, which a fill itself causes.
		untrack(() => preview(request.from, request.through)).then(
			(result) => {
				if (mine === serial) plan = { status: 'ready', preview: result };
			},
			(error) => {
				if (mine === serial)
					plan = { status: 'error', message: error instanceof Error ? error.message : 'The preview failed.' };
			}
		);
		return () => {
			serial++;
		};
	});

	function chooseFrom(value: string) {
		from = value;
		if (through < value) through = days[days.length - 1];
		notice = null;
	}

	function chooseThrough(value: string) {
		through = value;
		notice = null;
	}

	async function fill() {
		if (locked || plan.status !== 'ready' || picks.length === 0) return;
		const mine = serial;
		committing = true;
		try {
			const result = await commit(from, through, picks);
			if (mine !== serial) return;
			if (result === 'saved') onClose();
			else if (result === 'changed') {
				notice = 'The roster changed since this preview. Review the new picks and fill again.';
				planToken++;
			}
		} finally {
			committing = false;
		}
	}

	function dayLabel(date: string) {
		return DAY.format(parseDate(date));
	}

	function personName(id: string) {
		const person = personById.get(id);
		return person ? { prefix: person.rank, name: person.lastName } : { prefix: '', name: 'Outside your roster' };
	}

	function skipNote(pick: RosterFillPick) {
		return pick.passedOver
			.map((skip) => {
				const { prefix, name } = personName(skip.personId);
				const holds = skip.code === 'A' ? 'count holds' : 'count runs';
				return `Skipped ${prefix} ${name} (${skip.count}). On ${skip.reason}, ${holds}.`;
			})
			.join(' ');
	}
</script>

<Field.Group class="gap-3">
	<Field.Root>
		<Field.Label for={`roster-fill-from-${typeId}`}>Open days</Field.Label>
		<div class="flex items-center gap-2">
			<NativeSelect
				id={`roster-fill-from-${typeId}`}
				aria-label="First day"
				class="min-w-0 flex-1"
				disabled={locked}
				bind:value={() => from, chooseFrom}
			>
				{#each days as day (day)}
					<option value={day}>{dayLabel(day)}</option>
				{/each}
			</NativeSelect>
			<span class="text-sm text-muted-foreground">through</span>
			<NativeSelect
				aria-label="Last day"
				class="min-w-0 flex-1"
				disabled={locked}
				bind:value={() => through, chooseThrough}
			>
				{#each throughDays as day (day)}
					<option value={day}>{dayLabel(day)}</option>
				{/each}
			</NativeSelect>
		</div>
		<Field.Description>
			{open}
			{open === 1 ? 'open day' : 'open days'}. Days already assigned stay as they are.
		</Field.Description>
	</Field.Root>
</Field.Group>

<div class="-mx-3 border-y bg-muted/30" aria-live="polite" aria-busy={plan.status === 'loading'}>
	<div
		class="grid grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] px-3 pt-2 pb-1 font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase"
		aria-hidden="true"
	>
		<span>Day</span>
		<span>Next up</span>
		<span class="text-right">Count</span>
	</div>
	{#if notice}
		<p class="px-3 pb-1 text-[13px] text-destructive-text" role="alert">{notice}</p>
	{/if}
	{#if plan.status === 'loading'}
		<div class="grid gap-2 px-3 pt-1 pb-3" role="status" aria-label="Loading roster picks">
			{#each { length: Math.min(PREVIEW_ROWS, Math.max(open, 1)) }, row (row)}
				<div class="grid h-5 grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-center">
					<Skeleton class="h-3 w-9" />
					<Skeleton class="h-3.5 w-28" />
					<Skeleton class="ml-auto h-3 w-4" />
				</div>
			{/each}
		</div>
	{:else if plan.status === 'error'}
		<div class="grid gap-2 px-3 pt-1 pb-3" role="alert">
			<p class="text-sm">{plan.message}</p>
			<Button variant="outline" size="sm" class="w-fit" onclick={() => planToken++}>Retry preview</Button>
		</div>
	{:else if picks.length === 0}
		<p class="px-3 pt-1 pb-3 text-sm text-muted-foreground">
			{plan.preview.unfilled.length ? 'Nobody on the roster can take these days.' : 'No open days to fill.'}
		</p>
	{:else}
		<ol class="grid max-h-72 overflow-y-auto px-3 pb-2" aria-label="Roster picks">
			{#each shownPicks as pick (pick.date)}
				{@const who = personName(pick.personId)}
				{@const date = parseDate(pick.date)}
				<li class="grid grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-baseline gap-y-0.5 py-1">
					<span class="font-mono text-[11px] tracking-wider uppercase tabular-nums">
						{date.getDate()}
						{WEEKDAY.format(date)}
					</span>
					<span class="min-w-0 truncate">
						{#if who.prefix}
							<span class="font-mono text-[10px] text-muted-foreground uppercase">{who.prefix}</span>
						{/if}
						<span class="font-medium">{who.name}</span>
						{#if pick.returningFrom}
							<span class="text-[13px] text-muted-foreground">back from {pick.returningFrom}</span>
						{/if}
					</span>
					<span class="text-right font-mono text-[11px] font-semibold tabular-nums">{pick.count}</span>
					{#if pick.passedOver.length}
						<span class="col-start-2 col-end-4 text-[12px] text-muted-foreground italic">{skipNote(pick)}</span>
					{/if}
				</li>
			{/each}
		</ol>
		{#if picks.length > PREVIEW_ROWS}
			<div class="px-3 pb-2 pl-[calc(3.5rem+0.75rem)]">
				<Button
					variant="link"
					size="xs"
					class="h-auto p-0"
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
				>
					{expanded
						? 'Show fewer'
						: `${picks.length - PREVIEW_ROWS} more through ${dayLabel(picks[picks.length - 1].date)}`}
				</Button>
			</div>
		{/if}
		{#if plan.preview.unfilled.length}
			<p class="px-3 pb-2 text-[12px] text-muted-foreground">
				Nobody can take {plan.preview.unfilled.map(dayLabel).join(', ')}, so {plan.preview.unfilled.length === 1
					? 'it stays'
					: 'they stay'} open.
			</p>
		{/if}
	{/if}
</div>

<div class="flex items-center gap-2">
	<Button variant="ghost-destructive" size="sm" disabled={locked} onclick={onClearMonth}>Clear month</Button>
	<Button variant="ghost" size="sm" class="ml-auto" onclick={onClose}>Cancel</Button>
	<Button size="sm" disabled={locked || plan.status !== 'ready' || picks.length === 0} onclick={fill}>
		{committing ? 'Filling…' : fillLabel}
	</Button>
</div>
