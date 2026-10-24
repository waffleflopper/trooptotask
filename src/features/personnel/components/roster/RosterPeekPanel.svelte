<script lang="ts">
	import { onDestroy, tick, type Snippet } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import XIcon from '@lucide/svelte/icons/x';
	import { AttentionList } from '$lib/components/patterns/readiness-items';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import { cn } from '$lib/utils';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import type { PersonnelFollowUp } from '../../contracts';
	import { dueLabel, formatTimestampDayMonth, groupFollowUps } from '../../logModel';
	import { attentionRows, uncheckedSources } from '../../personnelAttentionView';
	import type { Personnel } from '../../personnel.types';
	import type { RosterPeekSection } from '../../rosterPeek';
	import { alreadyOpenOf, type ComposerEntry } from '../../rosterComposer';
	import { rosterStatusDot } from '../../rosterSignals';
	import { FollowUpList } from '../../workspace/followUpList.svelte';
	import { saveRosterEntry } from '../../workspace/rosterEntrySave';
	import RosterComposer from './RosterComposer.svelte';
	import { rosterEntrySaved } from './rosterEntrySaved';

	interface Props {
		ctx: PersonnelPageContext;
		person: Personnel;
		recordHref: string;
		/** The Person's place among the shown rows; `index` is -1 when a search hides them. */
		position: { index: number; total: number };
		onstep: (step: 1 | -1) => void;
		onclose: () => void;
		onquickedit: (person: Personnel) => void;
		/** Draws the 7-day Calendar strip, or its skeleton for `null`. The Calendar feature lives above Personnel. */
		nextDays?: Snippet<[calendar: unknown]>;
	}

	let { ctx, person, recordHref, position, onstep, onclose, onquickedit, nextDays }: Props = $props();

	const ATTENTION_SHOWN = 3;
	const FOLLOW_UPS_SHOWN = 5;

	let root = $state<HTMLElement | null>(null);
	/** The Person the docked composer is open for, so it closes when the panel moves on. */
	let composingFor = $state<string | null>(null);
	// A panel left open overnight still shows yesterday: the due shortcuts count from the viewer's day when it opens.
	let composeDay = $state('');
	let composer = $state<RosterComposer>();
	let alive = true;
	let leaving = false;
	onDestroy(() => {
		alive = false;
	});

	const name = $derived(`${person.rank} ${person.firstName} ${person.lastName}`);
	const shortName = $derived(`${person.rank} ${person.lastName}`);
	const eyebrow = $derived([person.groupName, person.clinicRole].filter(Boolean).join(' · '));
	const sections = $derived(ctx.peek.sections(person.id));
	const dot = $derived(rosterStatusDot(ctx.signalRow(person), ctx.signals.statusTypes));
	const orgPath = $derived(`/org/${ctx.orgUrlSegment}`);
	const alreadyOpen = $derived(alreadyOpenOf(ctx.signalRow(person), composeDay));
	const composing = $derived(composingFor === person.id);

	const attention = $derived.by(() => {
		const section = sections.attention;
		if (section.state !== 'ready') return null;
		const rows = attentionRows(section.value, { org: orgPath, person: recordHref });
		return {
			rows,
			shown: rows.slice(0, ATTENTION_SHOWN),
			more: rows.slice(ATTENTION_SHOWN).map((row) => row.title),
			unchecked: uncheckedSources(section.value)
		};
	});

	// One list per read, so a row checked here stays struck through with its box ticked instead of vanishing.
	const followUps = $derived.by(() => {
		const section = sections.followUps;
		if (section.state !== 'ready') return null;
		const personnelId = person.id;
		const list = new FollowUpList(section.value, {
			orgId: ctx.orgId,
			personnelId,
			fetch: (input, init) => fetch(input, init)
		});
		const order = groupFollowUps(section.value, ctx.data.asOf).open.map((row) => row.id);
		return { list, personnelId, order };
	});
	const followUpRows = $derived.by(() => {
		if (!followUps) return [];
		const rows = followUps.list.rows;
		return followUps.order.flatMap((id) => rows.find((row) => row.id === id) ?? []);
	});
	const openFollowUpCount = $derived(followUpRows.filter((row) => row.status === 'open').length);

	/** Moves focus into the panel, as Tab from the roster row does. */
	export function focusFirst(): void {
		root?.querySelector<HTMLElement>('button:not(:disabled), a[href]')?.focus();
	}

	/** Runs `then` once the docked composer holds no typed text, asking to discard it first. */
	export function release(then: () => void): void {
		if (!composing || !composer) then();
		else composer.requestClose(then);
	}

	async function toggleFollowUp(row: PersonnelFollowUp): Promise<void> {
		if (!followUps) return;
		const { list, personnelId } = followUps;
		const inOrganization = stillInOrganizationLifetime();
		if (!(await list.toggle(row.id)) || !inOrganization()) return;
		// Only the list that completed the write already shows it; one built since, after browsing away and back, rereads.
		const showsChange = alive && followUps?.list === list;
		ctx.peek.invalidate([personnelId], ['followUps'], { refetchShown: !showsChange });
		void ctx.signals.refresh([personnelId]);
	}

	async function save(entry: ComposerEntry): Promise<void> {
		const target = person;
		const href = recordHref;
		// The write may land after the user left the Organization; the lifetime then never settles, so nothing follows.
		await withinOrganizationLifetime(saveRosterEntry(fetch, { orgId: ctx.orgId, personId: target.id }, entry));
		rosterEntrySaved(ctx, target, entry, href);
		if (alive && composingFor === target.id) void closeComposer();
	}

	function isTyping(target: EventTarget | null): boolean {
		return target instanceof Element && target.closest('input, textarea, select, [contenteditable], form') !== null;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
		const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
		if (key === 'Escape') onclose();
		else if (key === 'j' || key === 'k') onstep(key === 'j' ? 1 : -1);
		else return;
		event.preventDefault();
	}

	function handleDockKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !composer) return;
		event.preventDefault();
		event.stopPropagation();
		composer.requestClose();
	}

	async function closeComposer(): Promise<void> {
		composingFor = null;
		await tick();
		root?.querySelector<HTMLElement>('[data-peek-compose]')?.focus();
	}

	// A link out of the panel would unmount the composer and lose the draft: hold it until Discard.
	beforeNavigate((navigation) => {
		if (leaving || !composing || !composer?.hasDraft()) return;
		navigation.cancel();
		if (navigation.willUnload || !navigation.to) return;
		const { url } = navigation.to;
		const delta = navigation.type === 'popstate' ? navigation.delta : undefined;
		composer.requestClose(() => {
			leaving = true;
			if (delta) history.go(delta);
			else void goto(resolve((url.pathname + url.search + url.hash) as '/'));
		});
	});
</script>

{#snippet heading(title: string, count?: number, action?: Snippet)}
	<div class="flex items-baseline justify-between gap-3">
		<h3 class="font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase">
			{title}{#if count !== undefined}&nbsp;· {count}{/if}
		</h3>
		{@render action?.()}
	</div>
{/snippet}

{#snippet failed(what: string, section: RosterPeekSection)}
	<div class="flex items-center justify-between gap-3 rounded-[4px] border border-dashed px-3 py-2">
		<p class="text-sm text-muted-foreground">Couldn't load {what}.</p>
		<Button type="button" variant="outline" size="xs" onclick={() => ctx.peek.retry(person.id, section)}>Retry</Button>
	</div>
{/snippet}

{#snippet readinessLink()}
	<a href="{recordHref}/readiness" class="text-[13px] leading-4 underline underline-offset-2">Readiness</a>
{/snippet}

{#snippet logLink()}
	<a href="{recordHref}/log" class="text-[13px] leading-4 underline underline-offset-2">Open log</a>
{/snippet}

<!-- J, K and Esc reach the panel from any control in it, not only from a focused row. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside
	bind:this={root}
	aria-label="Preview of {name}"
	class="flex h-full w-[470px] shrink-0 flex-col overflow-hidden border-l bg-background"
	onkeydown={handleKeydown}
>
	<div class="flex h-12 shrink-0 items-center justify-between gap-3 border-b pr-3 pl-5">
		<!-- Prev and Next stay focusable at either end, so J and K pressed on them never drop focus to the page. -->
		<div class="flex items-center gap-1">
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label="Previous person"
				title="Previous (K)"
				aria-disabled={position.index <= 0}
				class="aria-disabled:opacity-50"
				onclick={() => onstep(-1)}
			>
				<ChevronUpIcon aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label="Next person"
				title="Next (J)"
				aria-disabled={position.index >= position.total - 1}
				class="aria-disabled:opacity-50"
				onclick={() => onstep(1)}
			>
				<ChevronDownIcon aria-hidden="true" />
			</Button>
			<span class="pl-2 font-mono text-[11px] leading-[14px] text-muted-foreground">
				{position.index >= 0 ? `${position.index + 1} of ${position.total}` : `${position.total} shown`} · J/K
			</span>
		</div>
		<div class="flex items-center gap-1.5">
			<Button href={recordHref} variant="outline" size="sm" title="Open record (Enter)">
				Open record
				<ExternalLinkIcon aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Close preview"
				title="Close (Esc)"
				onclick={onclose}
			>
				<XIcon aria-hidden="true" />
			</Button>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<section class="flex flex-col gap-2 border-b px-6 pt-5.5 pb-4.5" aria-label="Identity">
			{#if eyebrow}
				<p class="font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
			{/if}
			<h2 class="font-heading text-[34px] leading-9 font-extrabold uppercase">{name}</h2>
			<div class="flex min-h-6 flex-wrap items-center gap-2.5">
				{#if person.mos}
					<Badge variant="outline" class="font-mono">{person.mos}</Badge>
				{/if}
				{#if dot.kind === 'skeleton'}
					<Skeleton class="h-6 w-28" />
				{:else if dot.kind === 'present'}
					<Badge variant="success">
						<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
						Present today
					</Badge>
				{:else if dot.kind === 'away'}
					<Badge variant="warning">
						<span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
						{dot.type.name} today
					</Badge>
				{/if}
				{#if sections.identity.state === 'loading'}
					<Skeleton class="h-4 w-28" />
				{:else if sections.identity.state === 'ready' && sections.identity.value.phone}
					<span class="font-mono text-[13px] leading-4 text-muted-foreground">{sections.identity.value.phone}</span>
				{:else if sections.identity.state === 'failed'}
					<span class="flex items-center gap-2 text-sm text-muted-foreground">
						Couldn't load the phone.
						<Button type="button" variant="outline" size="xs" onclick={() => ctx.peek.retry(person.id, 'identity')}
							>Retry</Button
						>
					</span>
				{/if}
			</div>
		</section>

		<div class="flex flex-col gap-6 px-6 py-5">
			{#if nextDays && sections.next7.state !== 'hidden'}
				<section class="flex flex-col gap-2.5" aria-label="Next 7 days">
					{@render heading('Next 7 days')}
					{#if sections.next7.state === 'ready'}
						{@render nextDays(sections.next7.value)}
					{:else if sections.next7.state === 'failed'}
						{@render failed('the Calendar', 'next7')}
					{:else}
						{@render nextDays(null)}
					{/if}
				</section>
			{/if}

			{#if sections.attention.state !== 'hidden'}
				<section class="flex flex-col gap-2.5" aria-label="Needs attention">
					{@render heading('Needs attention', attention?.rows.length, readinessLink)}
					{#if attention}
						{#if attention.rows.length > 0}
							<AttentionList compact rows={attention.shown} label="Needs attention" />
							{#if attention.more.length > 0}
								<p class="line-clamp-2 text-[13px] leading-4 text-muted-foreground">
									+{attention.more.length} more · {attention.more.join(', ')}
								</p>
							{/if}
						{:else if attention.unchecked.length === 0}
							<p class="text-sm text-muted-foreground">Nothing needs attention.</p>
						{/if}
						{#if attention.unchecked.length > 0}
							<div class="flex items-center justify-between gap-3 rounded-[4px] border border-dashed px-3 py-2">
								<p class="text-sm text-muted-foreground">Couldn't check {attention.unchecked.join(', ')}.</p>
								<Button type="button" variant="outline" size="xs" onclick={() => ctx.peek.retry(person.id, 'attention')}
									>Retry</Button
								>
							</div>
						{/if}
					{:else if sections.attention.state === 'failed'}
						{@render failed('readiness', 'attention')}
					{:else}
						<div class="flex flex-col gap-2" aria-busy="true" aria-label="Needs attention loading">
							{#each { length: ATTENTION_SHOWN }, index (index)}
								<Skeleton class="h-[34px] w-full" />
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if sections.followUps.state !== 'hidden'}
				<section class="flex flex-col gap-0.5" aria-label="Open follow-ups">
					<div class="pb-1.5">
						{@render heading('Open follow-ups', followUps ? openFollowUpCount : undefined, logLink)}
					</div>
					{#if followUps}
						{@const list = followUps.list}
						{#each followUpRows.slice(0, FOLLOW_UPS_SHOWN) as row (row.id)}
							{@const completed = row.status === 'completed'}
							{@const due = dueLabel(row.dueDate, ctx.data.asOf)}
							{@const error = list.rowErrors[row.id]}
							<div class="flex items-center gap-2.5 py-1.5" data-follow-up-id={row.id}>
								<Checkbox
									checked={completed}
									disabled={list.isBusy(row.id)}
									onCheckedChange={() => void toggleFollowUp(row)}
									aria-label={completed ? `Reopen ${row.title}` : `Complete ${row.title}`}
								/>
								<span
									class={cn(
										'min-w-0 flex-1 truncate text-sm leading-[18px]',
										completed && 'text-muted-foreground line-through'
									)}>{row.title}</span
								>
								<span
									class={cn(
										'shrink-0 font-mono text-xs',
										completed ? 'text-muted-foreground' : due.overdue ? 'text-destructive-text' : 'text-foreground'
									)}>{completed ? 'Done' : due.text}</span
								>
							</div>
							{#if error}
								<p role="alert" class="pl-6.5 text-sm text-destructive-text">{error}</p>
							{/if}
						{:else}
							<p class="text-sm text-muted-foreground">No open follow-ups.</p>
						{/each}
						{#if followUpRows.length > FOLLOW_UPS_SHOWN}
							<p class="pt-1 text-[13px] leading-4 text-muted-foreground">
								+{followUpRows.length - FOLLOW_UPS_SHOWN} more in the log
							</p>
						{/if}
					{:else if sections.followUps.state === 'failed'}
						{@render failed('follow-ups', 'followUps')}
					{:else}
						<div class="flex flex-col gap-0.5" aria-busy="true" aria-label="Open follow-ups loading">
							{#each { length: 2 }, index (index)}
								<div class="flex items-center gap-2.5 py-1.5">
									<Skeleton class="size-4 shrink-0" />
									<Skeleton class="h-4 flex-1" />
									<Skeleton class="h-4 w-16" />
								</div>
							{/each}
						</div>
					{/if}
				</section>
			{/if}

			{#if sections.note.state !== 'hidden'}
				<section class="flex flex-col gap-1.5" aria-label="Latest note">
					{@render heading('Latest note')}
					{#if sections.note.state === 'ready'}
						{@const note = sections.note.value}
						{#if note}
							<blockquote class="line-clamp-4 text-[15px] leading-[22px] italic">“{note.text}”</blockquote>
							<p class="text-[13px] leading-4 text-muted-foreground">
								{note.author} · {formatTimestampDayMonth(note.createdAt)}
							</p>
						{:else}
							<p class="text-sm text-muted-foreground">No notes yet.</p>
						{/if}
					{:else if sections.note.state === 'failed'}
						{@render failed('notes', 'note')}
					{:else}
						<div class="flex flex-col gap-1.5" aria-busy="true" aria-label="Latest note loading">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-4/5" />
							<Skeleton class="h-3.5 w-32" />
						</div>
					{/if}
				</section>
			{/if}
		</div>
	</div>

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div data-peek-dock class="shrink-0 border-t bg-muted" onkeydown={handleDockKeydown}>
		{#if composing}
			<div class="max-h-[60vh] overflow-y-auto bg-background">
				<RosterComposer
					bind:this={composer}
					heading={name}
					today={composeDay}
					{alreadyOpen}
					onsave={save}
					onclose={closeComposer}
				/>
			</div>
		{:else}
			<div class="flex gap-2 px-6 pt-3.5 pb-4">
				<button
					type="button"
					data-peek-compose
					class="flex h-9 min-w-0 flex-1 items-center rounded-[4px] border bg-background px-3 text-left text-sm text-muted-foreground hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => {
						composeDay = ctx.signals.viewerDay();
						composingFor = person.id;
					}}
				>
					<span class="truncate">Add a note or follow-up for {shortName}…</span>
				</button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					class="size-9 bg-background"
					aria-label="Quick edit {name}"
					title="Quick edit (E)"
					onclick={() => onquickedit(person)}
				>
					<PencilIcon aria-hidden="true" />
				</Button>
			</div>
		{/if}
	</div>
</aside>
