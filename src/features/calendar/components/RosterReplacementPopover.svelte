<script lang="ts">
	import { untrack } from 'svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import type { RosterReplacement } from '$features/calendar/contracts';
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
		/** The conflicted cell. The popover sits beside it, never over it. */
		anchor: HTMLElement;
		/** Where focus lands on close, for a control that may be gone by then; defaults to the anchor. */
		returnFocusTo?: () => HTMLElement | null;
		/** The person on the day when the popover opens. */
		assignee: Personnel | undefined;
		personById: ReadonlyMap<string, Personnel>;
		/** Without an assignee the server previews the rule's pick. */
		load: (assigneeId?: string) => Promise<RosterReplacement>;
		commit: (preview: RosterReplacement) => Promise<'saved' | 'changed' | 'failed'>;
		onSomeoneElse: () => void;
		onClose: () => void;
	}

	let { typeName, dateKey, anchor, returnFocusTo, assignee, personById, load, commit, onSomeoneElse, onClose }: Props =
		$props();

	const DEBOUNCE_MS = 150;
	const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
	const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

	const isMobile = new IsMobile();
	const date = $derived(parseDate(dateKey));
	const dateTitle = $derived(`${WEEKDAY.format(date)} ${DAY.format(date)}`);

	/** The last preview that arrived. A new selection keeps it on screen until its own preview replaces it. */
	let shown = $state.raw<RosterReplacement | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let failure = $state('');
	/** The operator's choice. Undefined takes the rule's pick. */
	let chosen = $state<string | undefined>(undefined);
	let planToken = $state(0);
	let notice = $state<string | null>(null);
	let committing = $state(false);
	let serial = 0;
	let dismissed = false;
	let handingOff = false;
	let content = $state<HTMLElement | null>(null);

	$effect(() => {
		const request = { assigneeId: chosen, token: planToken };
		const mine = ++serial;
		status = 'loading';
		const timer = setTimeout(
			() => {
				untrack(() => load(request.assigneeId)).then(
					(result) => {
						if (mine !== serial) return;
						const first = shown === null;
						shown = result;
						status = 'ready';
						// The chosen person left the pool since the list loaded, so the preview fell back to the rule's pick.
						if (request.assigneeId !== undefined && result.selected !== request.assigneeId) chosen = undefined;
						if (first) focusChoice();
					},
					(error) => {
						if (mine !== serial) return;
						status = 'error';
						failure = error instanceof Error ? error.message : 'The replacement preview failed.';
					}
				);
			},
			untrack(() => shown) ? DEBOUNCE_MS : 0
		);
		return () => {
			serial++;
			clearTimeout(timer);
		};
	});

	const selected = $derived(chosen ?? shown?.selected ?? undefined);
	const settled = $derived(status === 'ready' && shown !== null && shown.selected === selected);
	const locked = $derived(committing);
	const canAssign = $derived(settled && !locked && !!shown?.selected && shown.unfilled.length === 0);

	function person(id: string) {
		const found = personById.get(id);
		return found ? { prefix: found.rank, name: found.lastName } : { prefix: '', name: 'Outside your roster' };
	}

	// A save shows the new assignee in the slot at once, so the title keeps the person the popover opened for.
	// svelte-ignore state_referenced_locally
	const opened = assignee;
	const replaced = $derived(
		shown ? person(shown.replacing.personId) : opened ? { prefix: opened.rank, name: opened.lastName } : person('')
	);
	const assignName = $derived(selected ? person(selected).name : '');

	const explanation = $derived.by(() => {
		if (!shown) return '';
		const { count, effect } = shown.replacing;
		if (!effect) return `${replaced.name} can't serve this day.`;
		if (effect.code === 'A')
			return `${replaced.name} is on ${effect.reason}, so their count holds at ${count} and they keep their place in line. Nobody gets an extra turn out of this.`;
		return `${replaced.name} is on ${effect.reason}, so their count keeps running from ${count}.`;
	});

	function hint(adjacent: RosterReplacement['candidates'][number]['adjacent']) {
		return adjacent
			.map(({ name, day }) => `${name} ${day === 'before' ? 'the day before' : 'the next day'}`)
			.join(' · ');
	}

	function accessibleName(candidate: RosterReplacement['candidates'][number]) {
		const who = person(candidate.personId);
		return [
			`${who.prefix} ${who.name}`.trim(),
			`count ${candidate.count}`,
			candidate.personId === shown?.nextUp ? 'next up' : '',
			hint(candidate.adjacent)
		]
			.filter(Boolean)
			.join(', ');
	}

	function cantPullLine(entry: RosterReplacement['cantPull'][number]) {
		const who = person(entry.personId);
		const count = entry.code === 'A' ? `holds at ${entry.count}` : `count keeps running (${entry.count})`;
		return `${who.prefix} ${who.name} · ${entry.reason}, ${count}`;
	}

	function dayLabel(key: string) {
		return DAY.format(parseDate(key));
	}

	function choose(value: string) {
		chosen = value;
		notice = null;
	}

	function retry() {
		notice = null;
		planToken++;
	}

	async function assign() {
		if (!canAssign || !shown) return;
		const mine = serial;
		committing = true;
		try {
			const result = await commit(shown);
			if (dismissed) return;
			if (result === 'saved') onClose();
			else if (result === 'changed' && mine === serial) {
				notice = 'The roster changed since this preview. Review the new picks and try again.';
				planToken++;
			}
		} finally {
			if (!dismissed) committing = false;
		}
	}

	function dismiss() {
		dismissed = true;
		onClose();
	}

	function someoneElse() {
		dismissed = true;
		handingOff = true;
		onSomeoneElse();
	}

	function focusChoice() {
		queueMicrotask(() => {
			if (!content || document.activeElement !== content) return;
			content.querySelector<HTMLElement>('[data-slot=radio-group-item][data-state=checked]')?.focus();
		});
	}

	function focusContent(event: Event) {
		event.preventDefault();
		content?.focus();
	}

	function returnFocus(event: Event) {
		event.preventDefault();
		if (handingOff) return;
		const target = returnFocusTo?.() ?? anchor;
		if (target.isConnected) target.focus();
	}
</script>

{#snippet sectionTitle(text: string, trailing?: string)}
	<p
		class="flex items-baseline justify-between gap-2 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
	>
		<span>{text}</span>
		{#if trailing}<span aria-hidden="true">{trailing}</span>{/if}
	</p>
{/snippet}

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
		aria-label={`Replace ${replaced.prefix} ${replaced.name}, ${typeName}, ${dateTitle}`}
		tabindex={-1}
		onOpenAutoFocus={focusContent}
		onCloseAutoFocus={returnFocus}
	>
		<Popover.Header class="gap-1.5 border-b px-4 pt-3.5 pb-3">
			<p class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
				{typeName} · {dateTitle}
			</p>
			<Popover.Title class="font-display text-xl leading-tight font-bold tracking-wide uppercase">
				Replace {replaced.prefix}
				{replaced.name}
			</Popover.Title>
			{#if shown}
				<Popover.Description class="text-[13px] leading-snug text-muted-foreground">{explanation}</Popover.Description>
			{:else if status === 'loading'}
				<div class="grid gap-1.5 pt-0.5" aria-hidden="true">
					<Skeleton class="h-3 w-full" />
					<Skeleton class="h-3 w-3/4" />
				</div>
			{/if}
		</Popover.Header>

		{#if !shown}
			{#if status === 'error'}
				<div class="grid gap-2 px-4 py-3" role="alert">
					<p class="text-sm">{failure}</p>
					<Button variant="outline" size="sm" class="w-fit" onclick={retry}>Retry preview</Button>
				</div>
			{:else}
				<div class="grid gap-2.5 px-4 py-3" role="status" aria-label="Loading the roster">
					{#each { length: 3 }, row (row)}
						<div class="flex h-6 items-center gap-2">
							<Skeleton class="size-4 rounded-full" />
							<Skeleton class="h-3.5 w-28" />
							<Skeleton class="ml-auto h-3 w-4" />
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<section class="grid gap-2 border-b px-4 pt-3 pb-3" aria-labelledby="replacement-next-up">
				<div id="replacement-next-up">{@render sectionTitle(`Next up on the ${typeName} roster`, 'Count')}</div>
				{#if shown.candidates.length === 0}
					<p class="text-sm text-muted-foreground">Nobody on the roster is free this day.</p>
				{:else}
					<RadioGroup.Root
						class="-mx-2 max-h-56 gap-0.5 overflow-y-auto"
						aria-labelledby="replacement-next-up"
						disabled={locked}
						bind:value={() => selected ?? '', choose}
					>
						{#each shown.candidates as candidate (candidate.personId)}
							{@const who = person(candidate.personId)}
							{@const note = hint(candidate.adjacent)}
							<label
								class="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-md px-2 py-1.5 has-data-[state=checked]:bg-warning-muted"
							>
								<RadioGroup.Item value={candidate.personId} aria-label={accessibleName(candidate)} />
								<span class="flex min-w-0 items-baseline gap-1.5">
									{#if who.prefix}
										<span class="font-mono text-[10px] text-muted-foreground uppercase">{who.prefix}</span>
									{/if}
									<span class="truncate font-medium">{who.name}</span>
									{#if candidate.personId === shown.nextUp}
										<span
											class="shrink-0 rounded-xs border border-warning px-1 font-mono text-[9.5px] font-semibold tracking-wider uppercase"
											>Next up</span
										>
									{/if}
								</span>
								<span class="font-mono text-[11px] font-semibold tabular-nums">{candidate.count}</span>
								{#if note}
									<span class="col-start-2 col-end-4 truncate text-xs text-warning-foreground">{note}</span>
								{/if}
							</label>
						{/each}
					</RadioGroup.Root>
				{/if}
			</section>

			{#if shown.cantPull.length}
				<section class="grid gap-2 border-b bg-muted/40 px-4 py-3" aria-labelledby="replacement-cant-pull">
					<div id="replacement-cant-pull">{@render sectionTitle(`Can't pull ${dayLabel(shown.date)}`)}</div>
					<ul class="grid gap-1.5">
						{#each shown.cantPull as entry (entry.personId)}
							<li class="flex items-start gap-2 text-[13px] leading-snug">
								<RosterCodeChip code={entry.code} class="mt-px" />
								<span>{cantPullLine(entry)}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="grid gap-1.5 border-b px-4 py-3" aria-live="polite" aria-busy={status === 'loading'}>
				{#if notice}
					<p class="text-[13px] text-destructive-text" role="alert">{notice}</p>
				{/if}
				{#if status === 'error'}
					<div class="grid gap-2" role="alert">
						<p class="text-sm">{failure}</p>
						<Button variant="outline" size="sm" class="w-fit" onclick={retry}>Retry preview</Button>
					</div>
				{:else if !settled}
					<div class="grid gap-1.5" role="status" aria-label="Loading re-picks">
						<Skeleton class="h-4 w-40" />
						<Skeleton class="h-3.5 w-48" />
					</div>
				{:else}
					<p class="text-sm font-semibold">
						{#if shown.repicks.length}
							Also re-picks {shown.repicks.length} planned {shown.repicks.length === 1 ? 'day' : 'days'}
						{:else}
							No planned days change
						{/if}
					</p>
					{#if shown.repicks.length}
						<ol
							class="grid max-h-32 grid-cols-[3.5rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 overflow-y-auto"
							aria-label="Re-picked days"
						>
							{#each shown.repicks as repick (repick.date)}
								{@const day = parseDate(repick.date)}
								{@const was = person(repick.was)}
								{@const now = person(repick.personId)}
								<li class="col-span-4 grid grid-cols-subgrid items-center text-[13px]">
									<span class="font-mono text-[11px] tracking-wider uppercase tabular-nums">
										{day.getDate()}
										{WEEKDAY.format(day)}
									</span>
									<s class="truncate text-muted-foreground">{was.prefix} {was.name}</s>
									<ArrowRightIcon class="size-3.5 shrink-0" aria-label="to" />
									<span class="truncate font-medium">{now.prefix} {now.name}</span>
								</li>
							{/each}
						</ol>
					{/if}
					{#if shown.unfilled.length}
						<p class="text-[13px] text-destructive-text" role="alert">
							Nobody on the roster can take {shown.unfilled.map(dayLabel).join(', ')} after this change. Choose someone else.
						</p>
					{/if}
					<p class="text-xs text-muted-foreground">Days you assigned by hand stay put.</p>
				{/if}
			</section>
		{/if}

		<footer class="flex flex-wrap items-center gap-2 px-4 py-3">
			<Button variant="link" size="sm" class="mr-auto px-0" disabled={locked} onclick={someoneElse}>Someone else</Button
			>
			<Button variant="ghost" size="sm" disabled={locked} onclick={dismiss}>Cancel</Button>
			<Button size="sm" disabled={!canAssign} aria-busy={committing} onclick={assign}>
				{assignName ? `Assign ${assignName}` : 'Assign'}
			</Button>
		</footer>
	</Popover.Content>
</Popover.Root>
