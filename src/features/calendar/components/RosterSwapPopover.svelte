<script lang="ts">
	import { untrack } from 'svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { RosterSwapOptions } from '$features/calendar/contracts';
	import type { RosterSwapOutcome } from '$features/calendar/stores/dailyAssignments.svelte';
	import { effectLabel } from '$features/calendar/utils/plannerRosters';
	import type { Personnel } from '$features/personnel/contracts';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { parseDate } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import RosterCodeChip from './RosterCodeChip.svelte';

	interface Props {
		typeName: string;
		dateKey: string;
		/** The day's cell. The popover sits beside it, never over it. */
		anchor: HTMLElement;
		/** Where focus lands on close, for a control that may be gone by then; defaults to the anchor. */
		returnFocusTo?: () => HTMLElement | null;
		/** Who holds `dateKey` when the popover opens. */
		holderId: string;
		personById: ReadonlyMap<string, Personnel>;
		load: () => Promise<RosterSwapOptions>;
		/** Trades `dateKey` with `other`'s day. */
		commit: (other: { date: string; personId: string }) => Promise<RosterSwapOutcome>;
		onClose: () => void;
	}

	let { typeName, dateKey, anchor, returnFocusTo, holderId, personById, load, commit, onClose }: Props = $props();

	const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
	const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
	const CHANGED = 'The roster changed since this preview. Review the days and try again.';

	const isMobile = new IsMobile();
	const dayLabel = (key: string) => `${WEEKDAY.format(parseDate(key))} ${DAY.format(parseDate(key))}`;

	let options = $state.raw<RosterSwapOptions | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let failure = $state('');
	let loadToken = $state(0);
	let chosenDate = $state<string | undefined>();
	let notice = $state<string | null>(null);
	let committing = $state(false);
	let serial = 0;
	let dismissed = false;
	let content = $state<HTMLElement | null>(null);

	$effect(() => {
		void loadToken;
		const mine = ++serial;
		status = 'loading';
		options = null;
		untrack(() => load()).then(
			(result) => {
				if (mine !== serial) return;
				options = result;
				status = 'ready';
				if (!result.days.some((day) => day.date === chosenDate)) chosenDate = undefined;
			},
			(error) => {
				if (mine !== serial) return;
				status = 'error';
				failure = error instanceof Error ? error.message : 'The days to swap with could not be loaded.';
			}
		);
		return () => {
			serial++;
		};
	});

	function person(id: string) {
		const found = personById.get(id);
		return found ? { prefix: found.rank, name: found.lastName } : { prefix: '', name: 'Outside your roster' };
	}

	const holder = $derived(person(holderId));
	const chosen = $derived(options?.days.find((day) => day.date === chosenDate));
	const canSwap = $derived(status === 'ready' && chosen !== undefined && !committing);

	function warningLine(warning: RosterSwapOptions['days'][number]['warnings'][number]) {
		return `${person(warning.personId).name} · ${effectLabel(warning)} on ${dayLabel(warning.date)}`;
	}

	function optionName(day: RosterSwapOptions['days'][number]) {
		const who = person(day.personId);
		return [
			dayLabel(day.date),
			`${who.prefix} ${who.name}`.trim(),
			...day.warnings.map((warning) => warningLine(warning))
		].join(', ');
	}

	function choose(value: string) {
		chosenDate = value;
		notice = null;
	}

	function retry() {
		notice = null;
		loadToken++;
	}

	async function swap() {
		if (!canSwap || !chosen) return;
		const mine = serial;
		committing = true;
		try {
			const outcome = await commit({ date: chosen.date, personId: chosen.personId });
			if (dismissed) return;
			if (outcome.status === 'saved') onClose();
			else if (mine === serial) {
				notice = outcome.status === 'changed' ? CHANGED : outcome.message;
				if (outcome.status === 'changed') loadToken++;
			}
		} finally {
			if (!dismissed) committing = false;
		}
	}

	function dismiss() {
		dismissed = true;
		onClose();
	}

	function focusContent(event: Event) {
		event.preventDefault();
		content?.focus();
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		const target = returnFocusTo?.() ?? anchor;
		if (target.isConnected) target.focus();
	}
</script>

<Popover.Root open onOpenChange={(open) => !open && dismiss()}>
	<Popover.Content
		bind:ref={content}
		customAnchor={anchor}
		side={isMobile.current ? 'bottom' : 'right'}
		align={isMobile.current ? 'start' : 'center'}
		sideOffset={6}
		collisionPadding={8}
		class="max-h-(--bits-popover-content-available-height) w-84 max-w-(--bits-popover-content-available-width) gap-0 overflow-y-auto p-0"
		role="dialog"
		aria-label={`Swap ${typeName}, ${dayLabel(dateKey)}`}
		tabindex={-1}
		onOpenAutoFocus={focusContent}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="gap-1.5 border-b px-4 pt-3.5 pb-3">
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
				{typeName} · {dayLabel(dateKey)}
			</p>
			<Popover.Title class="font-display text-xl leading-tight font-bold tracking-wide uppercase">
				Swap {holder.prefix}
				{holder.name}
			</Popover.Title>
			<Popover.Description class="text-[13px] leading-snug text-muted-foreground">
				Trade this day for another day on the roster. Nothing changes until you press Swap days.
			</Popover.Description>
		</Popover.Header>

		<section class="grid gap-2 border-b px-4 py-3" aria-labelledby="swap-days">
			<p id="swap-days" class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
				Swap with
			</p>
			<div class="h-52 overflow-y-auto" aria-busy={status === 'loading'}>
				{#if status === 'loading'}
					<div class="grid gap-2.5" role="status" aria-label="Loading days to swap with">
						{#each { length: 5 }, row (row)}
							<div class="flex h-7 items-center gap-2">
								<Skeleton class="size-4 rounded-full" />
								<Skeleton class="h-3.5 w-16" />
								<Skeleton class="h-3.5 w-24" />
							</div>
						{/each}
					</div>
				{:else if status === 'error'}
					<div class="grid gap-2" role="alert">
						<p class="text-sm">{failure}</p>
						<Button variant="outline" size="sm" class="w-fit" onclick={retry}>Retry</Button>
					</div>
				{:else if options && options.days.length === 0}
					<p class="text-sm text-muted-foreground">
						No other day on this roster is held by someone else and free to trade.
					</p>
				{:else if options}
					<RadioGroup.Root
						class="-mx-2 gap-0.5"
						aria-labelledby="swap-days"
						disabled={committing}
						bind:value={() => chosenDate ?? '', choose}
					>
						{#each options.days as day (day.date)}
							{@const who = person(day.personId)}
							<label
								class="grid cursor-pointer grid-cols-[1rem_4.5rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-md px-2 py-1.5 has-data-[state=checked]:bg-warning-muted"
							>
								<RadioGroup.Item value={day.date} aria-label={optionName(day)} />
								<span class="font-mono text-[11px] tracking-wider uppercase tabular-nums">{dayLabel(day.date)}</span>
								<span class="flex min-w-0 items-baseline gap-1.5">
									{#if who.prefix}
										<span class="font-mono text-[10px] text-muted-foreground uppercase">{who.prefix}</span>
									{/if}
									<span class="truncate font-medium">{who.name}</span>
								</span>
								{#each day.warnings as warning (`${warning.personId}|${warning.date}`)}
									<span class="col-start-3 flex items-start gap-1.5 text-xs text-warning-foreground">
										<RosterCodeChip code={warning.code} class="size-4 text-[10px]" />
										<span>{warningLine(warning)}</span>
									</span>
								{/each}
							</label>
						{/each}
					</RadioGroup.Root>
				{/if}
			</div>
		</section>

		<section class="grid min-h-36 content-start gap-1.5 border-b px-4 py-3" aria-live="polite">
			{#if notice}
				<p class="text-[13px] text-destructive-text" role="alert">{notice}</p>
			{/if}
			{#if chosen}
				<p class="text-sm font-semibold">After the swap</p>
				<ol
					class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5"
					aria-label="Swapped days"
				>
					{#each [{ date: dateKey, was: holderId, now: chosen.personId }, { date: chosen.date, was: chosen.personId, now: holderId }] as row (row.date)}
						{@const was = person(row.was)}
						{@const now = person(row.now)}
						<li class="col-span-4 grid grid-cols-subgrid items-center text-[13px]">
							<span class="font-mono text-[11px] tracking-wider uppercase tabular-nums">{dayLabel(row.date)}</span>
							<s class="truncate text-muted-foreground">{was.prefix} {was.name}</s>
							<ArrowRightIcon class="size-3.5 shrink-0" aria-label="to" />
							<span class="truncate font-medium">{now.prefix} {now.name}</span>
						</li>
					{/each}
				</ol>
				{#each chosen.warnings as warning (`${warning.personId}|${warning.date}`)}
					<p class="flex items-start gap-1.5 text-[13px]">
						<RosterCodeChip code={warning.code} class="mt-px" />
						<span>{warningLine(warning)}</span>
					</p>
				{/each}
				<p class="text-xs text-muted-foreground">Numbers on the DA 6 stay as published.</p>
			{:else if !notice}
				<p class="text-sm text-muted-foreground">Choose a day to see both days after the swap.</p>
			{/if}
		</section>

		<footer class="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
			<Button variant="ghost" size="sm" disabled={committing} onclick={dismiss}>Cancel</Button>
			<Button size="sm" disabled={!canSwap} aria-busy={committing} onclick={swap}>Swap days</Button>
		</footer>
	</Popover.Content>
</Popover.Root>
