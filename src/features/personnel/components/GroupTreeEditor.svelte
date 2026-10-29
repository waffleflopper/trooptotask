<script lang="ts">
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import type { Group } from '../contracts';
	import type { GroupStructureCommands } from '../groupStructureCommands';
	import {
		addStandardSquads,
		canMoveUnder,
		groupDeletion,
		groupPickerOptions,
		MAX_GROUP_DEPTH,
		UNASSIGNED_OPTION
	} from '../groupStructure';
	import { buildGroupTree, type GroupNode } from '../groupTree';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { CoachMark } from '$lib/components/patterns/coach-mark';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { TreeSelect } from '$lib/components/patterns/tree-select';
	import { cn } from '$lib/utils';
	import type { GroupOrderChange } from '../stores/groups.svelte';

	interface Props {
		groups: readonly Group[];
		/** Everyone on the roster, for each Group's count and what a delete moves. */
		people: readonly { groupId: string | null }[];
		commands: GroupStructureCommands;
		loading?: boolean;
		/** Makes the rows selectable, as Manage Groups does to show one Group's members. */
		selectedId?: string | null;
		onSelect?: (id: string) => void;
		pinnedIds?: readonly string[];
		/** True while a change saves. */
		busy?: boolean;
		/** True while a typed name is not yet added or saved. */
		dirty?: boolean;
	}

	let {
		groups,
		people,
		commands,
		loading = false,
		selectedId = null,
		onSelect,
		pinnedIds = [],
		busy = $bindable(false),
		dirty = $bindable(false)
	}: Props = $props();

	// Group ids are UUIDs, so this never collides with one.
	const TOP_LEVEL = 'top-level';
	const SQUAD_COUNTS = [1, 2, 3, 4, 5, 6];

	type Action =
		| { kind: 'rename'; id: string; draft: string }
		| { kind: 'add-child'; id: string; draft: string }
		| { kind: 'move'; id: string; target: string | null }
		| { kind: 'squads'; id: string; count: number }
		| { kind: 'delete'; id: string; target: string };

	let newName = $state('');
	let hintDismissed = $state(false);
	let action = $state<Action | null>(null);
	let pending = $state<string | null>(null);
	let ordering = $state(0);
	let failure = $state<{ key: string; message: string } | null>(null);

	const tree = $derived(buildGroupTree(groups));
	const childrenOf = $derived(Map.groupBy(tree.ordered, (node) => node.parentId));
	const counts = $derived(tree.subtreeCounts(people, (person) => person.groupId));
	const noGroups = $derived(!loading && groups.length === 0);
	const showHint = $derived(noGroups && !hintDismissed);
	const acting = $derived(action ? tree.node(action.id) : undefined);
	const deletion = $derived(
		action?.kind === 'delete' ? groupDeletion(tree, action.id, people, (person) => person.groupId) : null
	);

	$effect(() => {
		busy = pending !== null || ordering > 0;
	});
	$effect(() => {
		dirty =
			newName.trim() !== '' ||
			(action?.kind === 'rename' && action.draft.trim() !== tree.node(action.id)?.name) ||
			(action?.kind === 'add-child' && action.draft.trim() !== '');
	});

	const keyOf = (kind: Action['kind'] | 'add' | 'order', id = '') => `${kind}:${id}`;
	const errorFor = (key: string) => (failure?.key === key ? failure.message : undefined);
	const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

	function names(nodes: readonly { name: string }[]): string {
		const list = nodes.map((node) => node.name);
		return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
	}

	async function run(key: string, work: () => Promise<unknown>): Promise<boolean> {
		if (pending) return false;
		pending = key;
		failure = null;
		try {
			await work();
			return true;
		} catch (cause) {
			failure = {
				key,
				message: cause instanceof Error && cause.message ? cause.message : 'That change did not save. Try again.'
			};
			return false;
		} finally {
			pending = null;
		}
	}

	function open(next: Action) {
		failure = null;
		action = next;
	}

	async function addTop() {
		const name = newName.trim();
		if (!name) return;
		hintDismissed = true;
		if (await run(keyOf('add'), () => commands.add(name, null))) newName = '';
	}

	async function addChild(id: string) {
		if (action?.kind !== 'add-child' || action.id !== id) return;
		const name = action.draft.trim();
		if (!name) return;
		const current = action;
		// The field stays open so a run of squads or teams goes in one after another.
		if ((await run(keyOf('add-child', id), () => commands.add(name, id))) && action === current) current.draft = '';
	}

	async function saveRename(id: string) {
		if (action?.kind !== 'rename' || action.id !== id) return;
		const name = action.draft.trim();
		if (!name) return;
		const current = action;
		if (name === tree.node(id)?.name) {
			action = null;
			return;
		}
		if ((await run(keyOf('rename', id), () => commands.rename(id, name))) && action === current) action = null;
	}

	async function confirm(current: Action, work: () => Promise<unknown>) {
		if ((await run(keyOf(current.kind, current.id), work)) && action === current) action = null;
	}

	async function reorder(parentId: string | null, siblings: readonly GroupNode[], id: string, toIndex: number) {
		const ids = siblings.map((node) => node.id).filter((sibling) => sibling !== id);
		ids.splice(toIndex, 0, id);
		failure = null;
		ordering++;
		try {
			const result: GroupOrderChange = await commands.reorder(ids, parentId);
			if (result.status === 'failed') failure = { key: keyOf('order', parentId ?? ''), message: result.message };
		} finally {
			ordering--;
		}
	}

	function startDelete(node: GroupNode) {
		open({ kind: 'delete', id: node.id, target: node.parentId ?? UNASSIGNED_OPTION });
	}

	const indent = ['pl-1', 'pl-5 max-sm:pl-4', 'pl-9 max-sm:pl-7'];
</script>

{#snippet nameField(
	value: string,
	label: string,
	key: string,
	onchange: (value: string) => void,
	onsubmit: () => void,
	oncancel: () => void,
	submitLabel: string,
	padding: string
)}
	<Field.Root data-invalid={errorFor(key) ? true : undefined} class={cn('gap-1 py-1.5 pr-2', padding)}>
		<div class="flex gap-1.5">
			<Input
				{value}
				aria-label={label}
				placeholder={label}
				readonly={pending === key}
				class="h-8 bg-background"
				oninput={(event) => {
					onchange(event.currentTarget.value);
					if (failure?.key === key) failure = null;
				}}
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						onsubmit();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						oncancel();
					}
				}}
			/>
			<Button type="button" size="sm" onclick={onsubmit} disabled={!value.trim() || pending !== null}>
				{submitLabel}
			</Button>
			<Button type="button" size="sm" variant="ghost" onclick={oncancel} disabled={pending === key}>Cancel</Button>
		</div>
		{#if errorFor(key)}<Field.Error>{errorFor(key)}</Field.Error>{/if}
	</Field.Root>
{/snippet}

{#snippet siblingSet(parentId: string | null, nodes: readonly GroupNode[])}
	<ReorderList
		entries={nodes.map((node) => ({ id: node.id, label: node.name }))}
		onmove={(id, toIndex) => reorder(parentId, nodes, id, toIndex)}
		aria-label={parentId ? `Sub-groups of ${tree.node(parentId)?.name ?? ''}` : 'Groups in display order'}
	>
		{#each nodes as node (node.id)}
			{@const children = childrenOf.get(node.id) ?? []}
			{@const selected = node.id === selectedId}
			{@const renaming = action?.kind === 'rename' && action.id === node.id ? action : null}
			{@const addingChild = action?.kind === 'add-child' && action.id === node.id ? action : null}
			<ReorderItem id={node.id}>
				{#if renaming}
					{@render nameField(
						renaming.draft,
						'Group name',
						keyOf('rename', node.id),
						(value) => (renaming.draft = value),
						() => saveRename(node.id),
						() => (action = null),
						'Save',
						indent[node.level] ?? 'pl-9'
					)}
				{:else}
					<div
						class={cn(
							'flex h-11 items-center gap-1 border-y border-l-[3px] border-transparent pr-1.5',
							indent[node.level],
							selected ? 'border-y-border border-l-accent bg-background' : onSelect && 'hover:bg-background/60'
						)}
					>
						<ReorderGrip />
						{#if onSelect}
							<button
								type="button"
								aria-current={selected ? 'true' : undefined}
								class="flex h-full min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onclick={() => onSelect(node.id)}
							>
								<span class={cn('min-w-0 flex-1 truncate text-[15px] leading-5', selected && 'font-semibold')}>
									{node.name}
								</span>
							</button>
						{:else}
							<span class="min-w-0 flex-1 truncate text-[15px] leading-5">{node.name}</span>
						{/if}
						{#if pinnedIds.includes(node.id)}
							<PinIcon aria-hidden="true" class="size-3.5 shrink-0 fill-accent text-accent" />
							<span class="sr-only">Pinned</span>
						{/if}
						<span class="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
							{counts.get(node.id) ?? 0}
						</span>
						{#if node.depth < MAX_GROUP_DEPTH}
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Add a sub-group to {node.name}"
								title="Add sub-group"
								disabled={pending !== null}
								onclick={() => open({ kind: 'add-child', id: node.id, draft: '' })}
							>
								<PlusIcon aria-hidden="true" />
							</Button>
						{:else}
							<span class="size-8 shrink-0" aria-hidden="true"></span>
						{/if}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger disabled={pending !== null}>
								{#snippet child({ props })}
									<Button
										{...props}
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Change {node.name}"
										title="Change"
									>
										<EllipsisIcon aria-hidden="true" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item onSelect={() => open({ kind: 'rename', id: node.id, draft: node.name })}>
									Rename
								</DropdownMenu.Item>
								<DropdownMenu.Item onSelect={() => open({ kind: 'move', id: node.id, target: null })}>
									Move under…
								</DropdownMenu.Item>
								{#if node.depth === 1}
									<DropdownMenu.Item onSelect={() => open({ kind: 'squads', id: node.id, count: 2 })}>
										Add standard squads…
									</DropdownMenu.Item>
								{/if}
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onSelect={() => startDelete(node)}>Delete…</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				{/if}
				{#if children.length > 0}
					{@render siblingSet(node.id, children)}
				{/if}
				{#if errorFor(keyOf('order', node.id))}
					<p role="alert" class={cn('py-1 pr-2 text-sm text-destructive-text', indent[node.level + 1] ?? 'pl-9')}>
						{errorFor(keyOf('order', node.id))}
					</p>
				{/if}
				{#if addingChild}
					{@render nameField(
						addingChild.draft,
						`New sub-group in ${node.name}`,
						keyOf('add-child', node.id),
						(value) => (addingChild.draft = value),
						() => addChild(node.id),
						() => (action = null),
						'Add',
						indent[node.level + 1] ?? 'pl-9'
					)}
				{/if}
			</ReorderItem>
		{/each}
	</ReorderList>
{/snippet}

<div class="flex min-h-0 flex-col">
	<Field.Root data-invalid={errorFor(keyOf('add')) ? true : undefined} class="gap-1.5 p-4">
		<CoachMark
			open={showHint}
			id="first-group-hint"
			title="Type a Group name here, then select Add."
			body="Enter works too. Add sub-groups from each Group's + button, and drag Groups into order after."
			onDismiss={() => (hintDismissed = true)}
		>
			<div class="flex gap-1.5">
				<Input
					bind:value={newName}
					aria-label="New group name"
					aria-describedby={showHint ? 'first-group-hint' : undefined}
					placeholder="New group name"
					readonly={pending === keyOf('add')}
					class="bg-background"
					oninput={() => {
						hintDismissed = true;
						if (failure?.key === keyOf('add')) failure = null;
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							void addTop();
						}
					}}
				/>
				<Button type="button" variant="outline" onclick={addTop} disabled={!newName.trim() || pending !== null}>
					Add
				</Button>
			</div>
		</CoachMark>
		{#if errorFor(keyOf('add'))}<Field.Error>{errorFor(keyOf('add'))}</Field.Error>{/if}
	</Field.Root>

	{#if loading}
		<div class="grid gap-3 px-4 py-3" aria-busy="true" aria-label="Loading Groups">
			{#each [0, 1, 2, 3] as row (row)}
				<Skeleton class="h-6 w-full" />
			{/each}
		</div>
	{:else if !noGroups}
		<p class="px-4 pt-1 pb-2 font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase">
			Drag to reorder within a level
		</p>
		{#if errorFor(keyOf('order'))}
			<p role="alert" class="px-4 pb-2 text-sm text-destructive-text">{errorFor(keyOf('order'))}</p>
		{/if}
		{@render siblingSet(null, tree.roots)}
	{/if}
</div>

{#if action?.kind === 'move' && acting}
	{@const current = action}
	{@const below = tree.ordered.filter((node) => node.id !== current.id && tree.contains(current.id, node.id))}
	<ConfirmDialog
		title="Move {acting.name}"
		message={below.length > 0
			? `${acting.name} and its ${plural(below.length, 'sub-group')} move together. Choose the Group it goes under.`
			: `Choose the Group ${acting.name} goes under.`}
		confirmLabel="Move"
		variant="default"
		disabled={current.target === null}
		loading={pending === keyOf('move', current.id)}
		onCancel={() => (action = null)}
		onConfirm={() =>
			confirm(current, () => commands.move(current.id, current.target === TOP_LEVEL ? null : current.target))}
	>
		<div class="grid gap-1.5">
			<TreeSelect
				label="Move under"
				placeholder="Choose a Group"
				searchPlaceholder="Search Groups"
				value={current.target}
				valueLabel={current.target === null
					? null
					: current.target === TOP_LEVEL
						? 'Top level'
						: tree.label(current.target)}
				options={[
					{ id: TOP_LEVEL, label: 'Top level', depth: 0, disabled: !canMoveUnder(tree, current.id, null) },
					...groupPickerOptions(tree, {
						include: (id) => !tree.contains(current.id, id),
						disabled: (id) => !canMoveUnder(tree, current.id, id)
					})
				]}
				onValueChange={(id: string) => (current.target = id)}
				class="w-full"
			/>
			{#if errorFor(keyOf('move', current.id))}
				<p role="alert" class="text-sm text-destructive-text">{errorFor(keyOf('move', current.id))}</p>
			{/if}
		</div>
	</ConfirmDialog>
{:else if action?.kind === 'squads' && acting}
	{@const current = action}
	<ConfirmDialog
		title="Add standard squads to {acting.name}"
		message="Each squad gets an Alpha Team and a Bravo Team. Squads and teams that already exist stay as they are."
		confirmLabel="Add {plural(current.count, 'squad')}"
		variant="default"
		loading={pending === keyOf('squads', current.id)}
		onCancel={() => (action = null)}
		onConfirm={() =>
			confirm(current, () =>
				addStandardSquads(groups, current.id, current.count, (name, parentId) => commands.add(name, parentId))
			)}
	>
		<div class="grid gap-1.5">
			<label class="flex items-center gap-2 text-sm text-foreground">
				Squads
				<NativeSelect.Root
					value={String(current.count)}
					onchange={(event) => (current.count = Number(event.currentTarget.value))}
					class="w-20"
				>
					{#each SQUAD_COUNTS as count (count)}
						<NativeSelect.Option value={String(count)}>{count}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</label>
			{#if errorFor(keyOf('squads', current.id))}
				<p role="alert" class="text-sm text-destructive-text">{errorFor(keyOf('squads', current.id))}</p>
			{/if}
		</div>
	</ConfirmDialog>
{:else if action?.kind === 'delete' && deletion}
	{@const current = action}
	{@const { group, descendants, memberCount } = deletion}
	<ConfirmDialog
		title={descendants.length > 0
			? `Delete ${group.name} and its ${plural(descendants.length, 'sub-group')}?`
			: `Delete ${group.name}?`}
		message={[
			descendants.length > 0 && `${names(descendants)} ${descendants.length === 1 ? 'is' : 'are'} deleted with it.`,
			memberCount > 0
				? `${plural(memberCount, 'person', 'people')} ${memberCount === 1 ? 'moves' : 'move'} to the Group you choose. Their records, notes and history are not affected.`
				: 'No one is in it.'
		]
			.filter(Boolean)
			.join(' ')}
		confirmLabel={memberCount > 0 ? `Delete and move ${memberCount}` : 'Delete'}
		loading={pending === keyOf('delete', current.id)}
		onCancel={() => (action = null)}
		onConfirm={() =>
			confirm(current, () =>
				commands.remove(current.id, memberCount > 0 && current.target !== UNASSIGNED_OPTION ? current.target : null)
			)}
	>
		<div class="grid gap-1.5">
			{#if memberCount > 0}
				<TreeSelect
					label="Move them to"
					placeholder="Choose a Group"
					searchPlaceholder="Search Groups"
					value={current.target}
					valueLabel={current.target === UNASSIGNED_OPTION ? 'Unassigned' : tree.label(current.target)}
					options={groupPickerOptions(tree, {
						include: (id) => !deletion.ids.has(id),
						unassigned: 'Unassigned'
					})}
					onValueChange={(id: string) => (current.target = id)}
					class="w-full"
				/>
			{/if}
			{#if errorFor(keyOf('delete', current.id))}
				<p role="alert" class="text-sm text-destructive-text">{errorFor(keyOf('delete', current.id))}</p>
			{/if}
		</div>
	</ConfirmDialog>
{/if}
