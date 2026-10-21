<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { AttentionActionRow } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import type { DashboardPageUpdates } from '../dashboardPageUpdates';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import type { DashboardAccess } from '../sections/dashboardAccess';
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
	}

	let { queue, model, access, updates }: Props = $props();

	let showAll = $state(false);
	let list = $state<HTMLUListElement>();

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

	function send(id: string, event: NeedsYouActionEvent<NeedsYouPanel>) {
		if (disposed) return;
		const next = nextActionState(stateOf(id), event);
		if (next.status === 'idle') actions.delete(id);
		else actions.set(id, next);
	}

	function messageOf(error: unknown, fallback: string): string {
		return error instanceof Error && error.message ? error.message : fallback;
	}

	async function open(id: string, action: Extract<NeedsYouAction, { open: unknown }>) {
		send(id, { type: 'open' });
		try {
			send(id, { type: 'opened', panel: await action.open() });
		} catch (error) {
			send(id, { type: 'failed', message: messageOf(error, `${action.label} did not open`) });
		}
	}

	async function save(id: string, label: string, command: () => Promise<void>): Promise<void> {
		if (stateOf(id).status === 'saving') return;
		send(id, { type: 'save' });
		try {
			await command();
			send(id, { type: 'saved' });
		} catch (error) {
			const message = messageOf(error, `${label} was not saved`);
			send(id, { type: 'failed', message });
			throw new Error(message);
		}
	}

	// The fold row leaves with its button, so focus moves to the first row it revealed.
	async function expand() {
		const firstRevealed = queue.rows.length;
		showAll = true;
		await tick();
		list?.children[firstRevealed]?.querySelector('a')?.focus();
	}
</script>

{#if queue.ranked.length === 0}
	<p class="border-t border-foreground py-4 text-sm text-muted-foreground">Nothing needs you right now.</p>
{:else}
	<ul bind:this={list} class="border-t border-foreground" aria-label="Needs you">
		{#each rows as item (item.id)}
			{@const kind = needsYouKindInfo(item.kind)}
			{@const act = item.action}
			{@const state = stateOf(item.id)}
			{@const panel = 'panel' in state ? state.panel : null}
			{@const busy = state.status === 'opening' || state.status === 'saving'}
			{@const panelId = `needs-you-panel-${item.id}`}
			{#snippet actionCell()}
				{#if act?.mode === 'link'}
					<Button variant="outline" href={act.href}>{act.label}</Button>
				{:else if act?.mode === 'run'}
					<Button
						variant="outline"
						disabled={busy}
						aria-busy={busy}
						onclick={() => save(item.id, act.label, () => act.run(updates)).catch(() => {})}
					>
						{act.label}
					</Button>
				{:else if act}
					<Button
						variant="outline"
						disabled={busy}
						aria-busy={busy}
						aria-haspopup={act.mode === 'dialog' ? 'dialog' : undefined}
						aria-expanded={act.mode === 'expand' ? panel !== null : undefined}
						aria-controls={act.mode === 'expand' && panel ? panelId : undefined}
						onclick={() => (panel ? send(item.id, { type: 'close' }) : open(item.id, act))}
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
					<div id={panelId}>
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
					<p role="alert" class="pb-3 pl-4 text-sm text-destructive @2xl/attention-row:pl-[116px]">{state.message}</p>
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
{/if}
