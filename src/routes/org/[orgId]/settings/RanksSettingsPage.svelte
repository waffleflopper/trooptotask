<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { RankState } from '$features/personnel/contracts';
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import RankNamesEditor from './RankNamesEditor.svelte';
	import { groupRanks, isHistoryRank } from './ranksCatalog';
	import { RankStateEdits, type RankStateChange } from './rankStateEdits.svelte';
	import type { RanksSettingsData, SettingsRankCatalogRow } from './settingsSectionTypes';

	type Note = { key: string; text: string; undo: RankStateChange[] };
	type Failure = { key: string; message: string };

	const FALLBACK_FAILURE = 'That change did not save. Try again.';
	const BRANCHES_KEY = 'branches';
	const CUSTOM_KEY = 'custom';

	let {
		ranksSettings,
		form,
		actionBase = '',
		saving = $bindable(false)
	}: {
		ranksSettings: RanksSettingsData;
		form: { [key: string]: unknown; rankError?: string } | null;
		/** The Settings › Ranks path, when the editor is shown on another page. Its actions live there. */
		actionBase?: string;
		/** A rank request is in flight. */
		saving?: boolean;
	} = $props();

	const edits = new RankStateEdits(
		(changes) =>
			post(
				'setRankStates',
				changes.flatMap((change) => [
					['code', change.code],
					['state', change.state]
				])
			),
		() => ranksSettings
	);

	let chosenTab = $state('');
	let note = $state<Note | null>(null);
	let failure = $state<Failure | null>(null);
	let addingBranch = $state(false);
	let namesOpen = $state(false);
	let namesEditor = $state<{ kind: 'new' } | { kind: 'rank'; code: string } | null>(null);
	let namesSaving = $state(false);
	let customRankButton = $state<HTMLElement | null>(null);

	const ranks = $derived(ranksSettings.sections.ranks);
	const canManage = $derived(ranks.commands.canManageCatalog);
	const shown = $derived(
		[...ranks.entries.active, ...ranks.entries.retired].map((entry) => ({
			...entry,
			state: edits.stateOf(entry.code, entry.state)
		}))
	);
	const board = $derived(groupRanks(shown, ranks.options.services));
	const tab = $derived(
		board.branches.some((branch) => branch.service === chosenTab) ? chosenTab : (board.branches[0]?.service ?? '')
	);
	const onCount = $derived(countOn(shown));
	const addableBranches = $derived(ranks.servicePacks.filter((pack) => pack.existingCount === 0));
	const nameRows = $derived(board.custom.filter((entry) => entry.commands.canEdit));

	$effect(() => {
		saving = edits.pending > 0 || addingBranch || namesSaving;
	});

	function countOn(entries: SettingsRankCatalogRow[]): number {
		return entries.filter((entry) => entry.state === 'active').length;
	}

	function plural(count: number, one: string, many: string): string {
		return `${count} ${count === 1 ? one : many}`;
	}

	function holders(entry: SettingsRankCatalogRow): number {
		return entry.referenceSummary.activeReferences.personnel;
	}

	/** Resolves with the failure message, or null once saved. */
	async function post(action: string, fields: string[][]): Promise<string | null> {
		const body = new FormData();
		for (const [name, value] of fields) body.append(name, value);
		try {
			const response = await fetch(`${actionBase}?/${action}`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				void invalidateAll();
				return null;
			}
			return result.type === 'failure' && typeof result.data?.rankError === 'string'
				? result.data.rankError
				: FALLBACK_FAILURE;
		} catch {
			return FALLBACK_FAILURE;
		}
	}

	function noteFor(moved: SettingsRankCatalogRow[], state: RankState, bulk: { label: string } | null): string | null {
		const held = state === 'retired' ? moved.filter((entry) => holders(entry) > 0) : [];
		if (!bulk) {
			const [entry] = held;
			return entry
				? `${entry.code} is off. ${plural(holders(entry), 'person keeps', 'people keep')} it on their records. New picks and imports won't offer it.`
				: null;
		}
		const done = `Turned ${state === 'active' ? 'on' : 'off'} ${plural(moved.length, `${bulk.label} rank`, `${bulk.label} ranks`)}.`;
		if (held.length === 0) return done;
		const list = held.map((entry) => `${entry.code} (${plural(holders(entry), 'person', 'people')})`).join(', ');
		return `${done} ${list} stay on the records of the people who hold them. New picks and imports won't offer them.`;
	}

	async function setStates(
		key: string,
		entries: SettingsRankCatalogRow[],
		state: RankState,
		bulk: { label: string } | null = null
	) {
		const moved = entries.filter((entry) => entry.state !== state);
		if (moved.length === 0) return;
		const undo = moved.map((entry) => ({ code: entry.code, state: entry.state }));
		const text = noteFor(moved, state, bulk);
		const shownNote: Note | null = text ? { key, text, undo } : null;
		note = shownNote ?? (note?.key === key ? null : note);
		if (failure?.key === key) failure = null;
		const failed = await edits.apply(moved.map((entry) => ({ code: entry.code, state })));
		if (!failed) return;
		failure = { key, message: failed };
		if (shownNote && note === shownNote) note = null;
	}

	async function undo(shownNote: Note) {
		note = null;
		const failed = await edits.apply(shownNote.undo);
		if (failed) failure = { key: shownNote.key, message: failed };
	}

	async function addBranch(service: string) {
		if (addingBranch) return;
		addingBranch = true;
		failure = null;
		const failed = await post('addServicePack', [['service', service]]);
		addingBranch = false;
		if (failed) failure = { key: BRANCHES_KEY, message: failed };
		else chosenTab = service;
	}

	function openNewRank() {
		namesOpen = true;
		namesEditor = { kind: 'new' };
	}
</script>

<div class="grid gap-6">
	{#if !canManage}
		<Alert.Root>
			<Alert.Description>
				Organization admin or owner access is required to turn ranks on or off, add a branch, or change custom ranks.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<section aria-labelledby="rank-board-heading">
		<PageShell.SectionHeader
			id="rank-board-heading"
			title="Your ranks"
			detail={`${onCount} on · ${shown.length - onCount} off · ${board.custom.length} custom`}
			size="compact"
			ruled
		>
			{#snippet action()}
				<ul class="flex items-center gap-3.5 font-mono text-[11px] text-muted-foreground" aria-label="Legend">
					<li class="flex items-center gap-1.5">
						<span class="h-2.5 w-3.5 rounded-xs bg-foreground" aria-hidden="true"></span>On
					</li>
					<li class="flex items-center gap-1.5">
						<span class="h-2.5 w-3.5 rounded-xs border border-dashed border-muted-foreground/40" aria-hidden="true"></span>Off
					</li>
				</ul>
			{/snippet}
		</PageShell.SectionHeader>

		<Tabs.Root value={tab} onValueChange={(value) => (chosenTab = value)}>
			<div class="flex items-end gap-x-7 border-b pt-3.5 max-md:overflow-x-auto">
				{#if board.branches.length > 0}
					<Tabs.List variant="line" aria-label="Branches" class="shrink-0">
						{#each board.branches as branch (branch.service)}
							<Tabs.Trigger value={branch.service} class="gap-2 pb-2.5 text-[15px]">
								{branch.label}
								<span class="font-mono text-[11px] font-normal text-muted-foreground">
									{countOn(branch.ranks)} of {branch.ranks.length} on
								</span>
							</Tabs.Trigger>
						{/each}
					</Tabs.List>
				{/if}
				{#if canManage && ranks.commands.canAddServicePack && addableBranches.length > 0}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="link"
									size="none"
									class="mb-2.5 shrink-0 text-[15px] font-normal text-foreground underline"
									aria-busy={addingBranch || undefined}
									disabled={addingBranch}
								>
									+ Add a branch
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{#each addableBranches as pack (pack.value)}
								<DropdownMenu.Item onSelect={() => addBranch(pack.value)}>
									{pack.label}
									<span class="ml-auto pl-4 font-mono text-xs text-muted-foreground">
										{plural(pack.builtInCount, 'rank', 'ranks')}
									</span>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
				{#if canManage}
					<p class="mb-2.5 ml-auto shrink-0 text-[13px] text-muted-foreground max-md:hidden">
						Select a rank to turn it on or off.
					</p>
				{/if}
			</div>
			{@render feedback(BRANCHES_KEY)}

			{#each board.branches as branch (branch.service)}
				<Tabs.Content value={branch.service}>
					{#each branch.categories as group (group.key)}
						{@render block(group.key, group.label, group.ranks, `${countOn(group.ranks)} of ${group.ranks.length} on`)}
					{/each}
				</Tabs.Content>
			{/each}
		</Tabs.Root>

		{@render block(
			CUSTOM_KEY,
			'Custom',
			board.custom,
			`${plural(board.custom.length, 'rank', 'ranks')} · your Organization only`
		)}

		{#if namesOpen}
			<div id="rank-names-editor" class="border-b pb-4">
				<RankNamesEditor
					{ranks}
					rows={nameRows}
					{form}
					{actionBase}
					bind:openEditor={namesEditor}
					bind:saving={namesSaving}
					focusAfterClose={() => customRankButton}
				/>
			</div>
		{/if}
	</section>
</div>

{#snippet block(key: string, label: string, entries: SettingsRankCatalogRow[], detail: string)}
	{@const custom = key === CUSTOM_KEY}
	<section aria-labelledby="{key}-heading" class="grid gap-3 border-b py-4.5">
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h3 id="{key}-heading" class="font-heading text-lg leading-[22px] font-bold">{label}</h3>
			<p class="flex-1 font-mono text-xs text-muted-foreground">{detail}</p>
			{#if canManage}
				<div class="flex items-center gap-4 max-sm:basis-full">
					{#if custom}
						{#if nameRows.length > 0}
							<Button
								variant="link"
								size="none"
								class="font-mono text-xs text-foreground underline"
								aria-expanded={namesOpen}
								aria-controls={namesOpen ? 'rank-names-editor' : undefined}
								onclick={() => (namesOpen = !namesOpen)}
							>
								Edit names
							</Button>
						{/if}
					{:else}
						<Button
							variant="link"
							size="none"
							class="font-mono text-xs text-foreground underline"
							aria-label="Turn all {label} ranks on"
							onclick={() => setStates(key, entries, 'active', { label })}
						>
							Turn all on
						</Button>
						<Button
							variant="link"
							size="none"
							class="font-mono text-xs text-foreground underline"
							aria-label="Turn all {label} ranks off"
							onclick={() => setStates(key, entries, 'retired', { label })}
						>
							Turn all off
						</Button>
					{/if}
				</div>
			{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			{#each entries as entry (entry.code)}
				{@const history = isHistoryRank(entry)}
				<Toggle
					variant="tag"
					size="tag"
					pressed={entry.state === 'active'}
					disabled={!canManage}
					title={entry.label}
					aria-label={history ? `${entry.label} (history)` : entry.label}
					onPressedChange={(on) => setStates(key, [entry], on ? 'active' : 'retired')}
				>
					{#if entry.state === 'active'}<CheckIcon aria-hidden="true" />{/if}
					{entry.code}
					{#if entry.payGrade !== 'ungraded'}
						<span class="font-normal opacity-65">{entry.payGradeLabel}</span>
					{/if}
					{#if history}
						<span
							class="rounded-xs bg-muted px-1 text-[10px] font-medium tracking-[0.06em] text-muted-foreground uppercase"
						>
							History
						</span>
					{/if}
				</Toggle>
			{/each}
			{#if custom && canManage && ranks.commands.canAddCustomRank}
				<Button
					bind:ref={customRankButton}
					variant="outline"
					class="h-8"
					disabled={namesEditor?.kind === 'new'}
					onclick={openNewRank}
				>
					+ Custom rank
				</Button>
			{/if}
		</div>
		{@render feedback(key)}
	</section>
{/snippet}

{#snippet feedback(key: string)}
	{#if failure?.key === key}
		<p role="alert" class="text-sm text-destructive-text">{failure.message}</p>
	{/if}
	<div role="status" class="empty:hidden">
		{#if note?.key === key && failure?.key !== key}
			{@const shownNote = note}
			<div class="flex items-baseline gap-4 bg-muted px-3 py-2.5">
				<p class="flex-1 text-sm leading-5">{shownNote.text}</p>
				<Button
					variant="link"
					size="none"
					class="font-mono text-xs text-foreground underline"
					onclick={() => undo(shownNote)}
				>
					Undo
				</Button>
			</div>
		{/if}
	</div>
{/snippet}
