<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { SvelteMap } from 'svelte/reactivity';
	import { AttentionActionRow, AttentionActionRowSkeleton } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import type { DashboardPageUpdates } from '../dashboardPageUpdates';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import type { DashboardAccess } from '../sections/dashboardAccess';
	import type { NeedsYouLoad } from '../sections/dashboardSections';
	import { needsYouKindInfo, type NeedsYouAction, type NeedsYouPanel, type NeedsYouQueue } from '../sections/needsYou';
	import {
		IDLE_ACTION,
		nextActionState,
		type NeedsYouActionEvent,
		type NeedsYouActionState
	} from '../sections/needsYouAction';

	interface Props {
		queue: NeedsYouQueue;
		model: DashboardScreenModel;
		access: DashboardAccess;
		updates: DashboardPageUpdates;
		/** Features whose rows could not load; the queue is then incomplete, not clear. */
		unavailable?: readonly string[];
		/** Sources that arrive after the page: a placeholder row while pending, a note with Try again when failed. */
		loads?: readonly NeedsYouLoad[];
	}

	let { queue, model, access, updates, unavailable = [], loads = [] }: Props = $props();

	const pending = $derived(loads.some((load) => load.state === 'pending'));
	const failedLoads = $derived(loads.filter((load) => load.state === 'failed'));
	const partialLoads = $derived(loads.flatMap((load) => (load.state === 'partial' ? [load] : [])));
	const incompleteLabels = $derived([...unavailable, ...failedLoads.map((load) => load.label)]);

	let showAll = $state(false);
	let list = $state<HTMLUListElement>();
	let empty = $state<HTMLParagraphElement>();
	let incompleteNote = $state<HTMLDivElement>();

	const rows = $derived(showAll ? queue.ranked : queue.rows);

	// Each row's action, by item id; an idle row has no entry.
	const actions = new SvelteMap<string, NeedsYouActionState<NeedsYouPanel>>();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	function stateOf(id: string): NeedsYouActionState<NeedsYouPanel> {
		return actions.get(id) ?? IDLE_ACTION;
	}

	function send(id: string, event: NeedsYouActionEvent<NeedsYouPanel>, index = rows.findIndex((row) => row.id === id)) {
		if (disposed) return;
		const previous = stateOf(id);
		const next = nextActionState(previous, event);
		if (next.status === 'idle') actions.delete(id);
		else actions.set(id, next);
		if (event.type === 'saved' || (panelOf(previous) && !panelOf(next))) void keepFocus(id, index);
	}

	function panelOf(state: NeedsYouActionState<NeedsYouPanel>): NeedsYouPanel | null {
		return 'panel' in state ? state.panel : null;
	}

	const actionId = (id: string) => `needs-you-action-${id}`;
	const panelIdOf = (id: string) => `needs-you-panel-${id}`;

	// A closed panel or a row that left takes focus with it: return it to the action, or to the row now in its place.
	async function keepFocus(id: string, index: number) {
		await tick();
		if (disposed || (document.activeElement && document.activeElement !== document.body)) return;
		const next = list?.children[Math.min(index, list.children.length - 1)];
		(
			document.getElementById(actionId(id)) ??
			next?.querySelector<HTMLElement>('a, button') ??
			incompleteNote ??
			empty
		)?.focus();
	}

	// An optimistic save that took the row away and then failed brings it back as a new row: focus its submit again.
	async function restoreFocusAfterFailure(id: string) {
		await tick();
		if (disposed || (document.activeElement && document.activeElement !== document.body)) return;
		const target = document.getElementById(panelIdOf(id))?.querySelector<HTMLElement>('[data-needs-you-submit]');
		(target ?? document.getElementById(actionId(id)))?.focus();
	}

	function messageOf(error: unknown, fallback: string): string {
		return error instanceof Error && error.message ? error.message : fallback;
	}

	async function open(id: string, action: Extract<NeedsYouAction, { open: unknown }>) {
		// One row works in place at a time; a row mid-save keeps its panel until the save lands.
		if (action.mode === 'expand')
			for (const [other, state] of actions)
				if (other !== id && state.status !== 'saving' && panelOf(state)) send(other, { type: 'close' });
		send(id, { type: 'open' });
		try {
			send(id, { type: 'opened', panel: await action.open() });
		} catch (error) {
			send(id, { type: 'failed', message: messageOf(error, `${action.label} did not open`) });
		}
	}

	async function save(id: string, label: string, command: () => Promise<void>): Promise<void> {
		if (stateOf(id).status === 'saving') return;
		const index = rows.findIndex((row) => row.id === id);
		send(id, { type: 'save' });
		try {
			await command();
			send(id, { type: 'saved' }, index);
		} catch (error) {
			const message = messageOf(error, `${label} was not saved`);
			send(id, { type: 'failed', message });
			void restoreFocusAfterFailure(id);
			throw new Error(message);
		}
	}

	// Escape inside a panel opened in place folds it; focus returns to the action as for any close.
	function escapeCloses(id: string): Attachment<HTMLElement> {
		return (node) => {
			function onKeydown(event: KeyboardEvent) {
				if (event.key !== 'Escape' || event.defaultPrevented || stateOf(id).status === 'saving') return;
				event.preventDefault();
				send(id, { type: 'close' });
			}
			node.addEventListener('keydown', onKeydown);
			return () => node.removeEventListener('keydown', onKeydown);
		};
	}

	// The fold row leaves with its button, so focus moves to the first row it revealed.
	async function expand() {
		const firstRevealed = queue.rows.length;
		showAll = true;
		await tick();
		list?.children[firstRevealed]?.querySelector('a')?.focus();
	}
</script>

{#snippet incomplete()}
	<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-3 text-sm text-muted-foreground">
		<p>Needs you is incomplete. {incompleteLabels.join(' and ')} items could not load.</p>
		{#each failedLoads as load (load.label)}
			<Button variant="link" class="px-0 underline" onclick={() => load.retry(updates)}>Try again</Button>
		{/each}
	</div>
{/snippet}

{#snippet unlisted()}
	{#each partialLoads as load (load.label)}
		<p class="border-t border-border py-3 text-sm text-muted-foreground">
			{load.unlisted} more {load.label} items are not listed.
			<Button variant="link" class="h-auto px-0 underline" href={load.href}>Open Taskings</Button>
		</p>
	{/each}
{/snippet}

{#snippet placeholder()}
	<div aria-hidden="true" data-needs-you-pending>
		<AttentionActionRowSkeleton />
	</div>
{/snippet}

{#if queue.ranked.length === 0}
	{#if incompleteLabels.length > 0}
		<div bind:this={incompleteNote} tabindex="-1" class="border-t border-foreground outline-none">
			{@render incomplete()}
		</div>
	{:else if pending}
		<div class="border-t border-foreground">{@render placeholder()}</div>
	{:else}
		<p
			bind:this={empty}
			tabindex="-1"
			class="border-t border-foreground py-4 text-sm text-muted-foreground outline-none"
		>
			Nothing needs you right now.
		</p>
	{/if}
{:else}
	<ul bind:this={list} class="border-t border-foreground" aria-label="Needs you">
		{#each rows as item (item.id)}
			{@const kind = needsYouKindInfo(item.kind)}
			{@const act = item.action}
			{@const state = stateOf(item.id)}
			{@const panel = panelOf(state)}
			{@const busy = state.status === 'opening' || state.status === 'saving'}
			{@const panelId = panelIdOf(item.id)}
			{#snippet actionCell()}
				{#if act?.mode === 'link'}
					<Button variant="outline" href={act.href}>{act.label}</Button>
				{:else if act?.mode === 'run'}
					<Button
						id={actionId(item.id)}
						variant="outline"
						aria-disabled={busy}
						aria-busy={busy}
						onclick={() => save(item.id, act.label, () => act.run(updates)).catch(() => {})}
					>
						{act.label}
					</Button>
				{:else if act}
					<Button
						id={actionId(item.id)}
						variant="outline"
						aria-disabled={busy}
						aria-busy={busy}
						aria-haspopup={act.mode === 'dialog' ? 'dialog' : undefined}
						aria-expanded={act.mode === 'expand' ? panel !== null : undefined}
						aria-controls={act.mode === 'expand' && panel ? panelId : undefined}
						onclick={() => (busy ? undefined : panel ? send(item.id, { type: 'close' }) : open(item.id, act))}
					>
						{act.label}
					</Button>
				{/if}
			{/snippet}
			<AttentionActionRow
				tone={kind.severity}
				label={kind.label}
				title={item.title}
				subtitle={item.subtitle}
				timing={item.timing}
				href={item.href}
				onOpen={item.onOpen}
				action={act ? actionCell : undefined}
				expanded={act?.mode === 'expand' && panel !== null}
			>
				{#if panel}
					<div id={panelId} {@attach act?.mode === 'expand' ? escapeCloses(item.id) : undefined}>
						<panel.component
							{...panel.props}
							{model}
							{access}
							{updates}
							save={(command: () => Promise<void>) => save(item.id, act?.label ?? 'Change', command)}
							saving={state.status === 'saving'}
							failure={state.status === 'failed' ? state.message : null}
							close={() => send(item.id, { type: 'close' })}
						/>
					</div>
				{:else if state.status === 'failed'}
					<p role="alert" class="pb-3 pl-4 text-sm text-danger-foreground @2xl/attention-row:pl-[116px]">
						{state.message}
					</p>
				{/if}
			</AttentionActionRow>
		{/each}
		{#if queue.fold && !showAll}
			<li class="flex min-h-12 items-center gap-4 border-b border-border pl-[19px]">
				<span
					class="w-[84px] shrink-0 font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					+{queue.fold.count} more
				</span>
				<span class="min-w-0 flex-1 truncate text-sm leading-[18px] text-muted-foreground">
					{queue.fold.titles.join(' · ')}
				</span>
				<span class="pr-2">
					<Button variant="link" class="px-0 underline" onclick={expand}>
						Show all {queue.ranked.length}
					</Button>
				</span>
			</li>
		{/if}
	</ul>
	{#if pending}
		{@render placeholder()}
	{/if}
	{#if incompleteLabels.length > 0}
		{@render incomplete()}
	{/if}
	{@render unlisted()}
{/if}
