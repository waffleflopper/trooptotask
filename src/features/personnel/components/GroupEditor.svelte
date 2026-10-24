<script lang="ts" module>
	export const UNASSIGNED = 'unassigned';
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Group } from '$features/personnel/contracts';
	import type { Personnel } from '../personnel.types';
	import type { RosterStatusDot } from '../rosterSignals';
	import type { GroupOrderChange } from '../stores/groups.svelte';
	import type { GroupMembershipChange } from '../utils/moveGroupMembers';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { cn } from '$lib/utils';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	type Control = 'add' | 'order' | 'rename' | 'pin' | 'add-people' | 'members' | 'delete';

	interface Props {
		groups: Group[];
		people: Personnel[];
		pinnedNames: readonly string[];
		loading?: boolean;
		initialSelection?: string | null;
		todayStatus?: (person: Personnel) => RosterStatusDot;
		canMovePerson: (person: Personnel) => boolean;
		canMoveTo: (groupId: string | null) => boolean;
		onAdd: (name: string) => Promise<void>;
		onRename: (id: string, name: string) => Promise<void>;
		onReorder: (ids: string[]) => Promise<GroupOrderChange>;
		onTogglePin: (name: string) => Promise<boolean>;
		onDelete: (id: string, moveMembersTo: string | null) => Promise<void>;
		onMove: (personnelIds: string[], groupId: string | null) => Promise<GroupMembershipChange>;
		onClose: () => void;
	}

	let {
		groups,
		people,
		pinnedNames,
		loading = false,
		initialSelection = null,
		todayStatus,
		canMovePerson,
		canMoveTo,
		onAdd,
		onRename,
		onReorder,
		onTogglePin,
		onDelete,
		onMove,
		onClose
	}: Props = $props();

	let selectedId = $state<string>(untrack(() => initialSelection ?? groups[0]?.id ?? UNASSIGNED));
	let newGroupName = $state('');
	let renameDraft = $state<string | null>(null);
	let checked = $state<string[]>([]);
	let pending = $state<Control | null>(null);
	let requestVersion = 0;
	let failures = $state<Partial<Record<Control, string>>>({});
	let notice = $state<string | null>(null);
	let confirmingDelete = $state(false);
	let deleteTrigger = $state<HTMLElement | null>(null);
	let deletePicker = $state<HTMLSelectElement | null>(null);
	let deleteCancel = $state<HTMLElement | null>(null);
	let moveTarget = $state(UNASSIGNED);
	let addPeopleValue = $state('');
	let ordering = $state(0);
	let detailsRef = $state<HTMLElement | null>(null);

	const groupIds = $derived(new Set(groups.map((group) => group.id)));
	const membersByGroup = $derived.by(() => {
		const members = new Map<string, Personnel[]>();
		for (const person of people) {
			const key = person.groupId && groupIds.has(person.groupId) ? person.groupId : UNASSIGNED;
			const list = members.get(key);
			if (list) list.push(person);
			else members.set(key, [person]);
		}
		return members;
	});
	const selectedGroup = $derived(groups.find((group) => group.id === selectedId) ?? null);
	const selectionKey = $derived(selectedGroup ? selectedGroup.id : UNASSIGNED);
	const selectedName = $derived(selectedGroup?.name ?? 'Unassigned');
	const members = $derived(membersByGroup.get(selectionKey) ?? []);
	const memberColumns = $derived(
		todayStatus
			? 'grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_6.875rem] sm:grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_12.5rem_6.875rem]'
			: 'grid-cols-[1.75rem_3.25rem_minmax(0,1fr)] sm:grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_12.5rem]'
	);
	const movableMembers = $derived(members.filter(canMovePerson));
	const checkedMembers = $derived(members.filter((person) => checked.includes(person.id)));
	const targetGroupId = $derived(selectedGroup?.id ?? null);
	const isPinned = $derived(selectedGroup ? pinnedNames.includes(selectedGroup.name) : false);
	const entries = $derived(groups.map((group) => ({ id: group.id, label: group.name })));
	const busy = $derived(pending !== null || ordering > 0);
	const dirty = $derived(newGroupName.trim() !== '' || (renameDraft !== null && renameDraft !== selectedGroup?.name));

	const moveTargets = $derived([
		...groups
			.filter((group) => group.id !== selectionKey && canMoveTo(group.id))
			.map((g) => ({ id: g.id, name: g.name })),
		...(selectionKey !== UNASSIGNED && canMoveTo(null) ? [{ id: UNASSIGNED, name: 'Unassigned' }] : [])
	]);

	const groupNames = $derived(new Map(groups.map((group) => [group.id, group.name])));
	const addPeopleItems = $derived.by(() => {
		if (!selectedGroup || !canMoveTo(selectedGroup.id)) return [];
		const order = new Map(groups.map((group, index) => [group.id, index]));
		const rank = (person: Personnel) =>
			person.groupId && groupIds.has(person.groupId) ? (order.get(person.groupId) ?? 0) + 1 : 0;
		return people
			.filter((person) => person.groupId !== selectedGroup.id && canMovePerson(person))
			.toSorted((a, b) => rank(a) - rank(b))
			.map((person) => ({
				value: person.id,
				label: personName(person),
				description: person.clinicRole || undefined,
				group: (person.groupId && groupNames.get(person.groupId)) || 'Unassigned'
			}));
	});

	function personName(person: Personnel) {
		return `${person.rank} ${person.lastName}, ${person.firstName}`.trim();
	}

	function messageOf(cause: unknown) {
		return cause instanceof Error && cause.message ? cause.message : 'That change did not save. Try again.';
	}

	async function run(control: Control, change: () => Promise<void>): Promise<boolean> {
		if (pending) return false;
		const groupId = selectionKey;
		const request = ++requestVersion;
		pending = control;
		failures = { ...failures, [control]: undefined };
		notice = null;
		try {
			await change();
			return true;
		} catch (cause) {
			if (control === 'add' || (request === requestVersion && selectionKey === groupId)) {
				failures = { ...failures, [control]: messageOf(cause) };
			}
			return false;
		} finally {
			pending = null;
		}
	}

	function clearFailure(control: Control) {
		if (failures[control]) failures = { ...failures, [control]: undefined };
	}

	async function select(id: string) {
		if (id === selectedId) return;
		requestVersion++;
		selectedId = id;
		checked = [];
		renameDraft = null;
		confirmingDelete = false;
		notice = null;
		failures = {
			...failures,
			rename: undefined,
			pin: undefined,
			'add-people': undefined,
			members: undefined,
			delete: undefined
		};
		if (!window.matchMedia('(min-width: 64rem)').matches) {
			await tick();
			detailsRef?.scrollIntoView({ block: 'start' });
		}
	}

	async function addGroup() {
		const name = newGroupName.trim();
		if (!name || pending) return;
		if (await run('add', () => onAdd(name))) {
			newGroupName = '';
			const added = groups.find((group) => group.name === name);
			if (added) void select(added.id);
		}
	}

	async function move(id: string, toIndex: number) {
		const ids = groups.map((group) => group.id).filter((groupId) => groupId !== id);
		ids.splice(toIndex, 0, id);
		clearFailure('order');
		ordering++;
		try {
			const result = await onReorder(ids);
			if (result.status === 'failed') failures = { ...failures, order: result.message };
		} finally {
			ordering--;
		}
	}

	async function saveRename() {
		const group = selectedGroup;
		const name = renameDraft?.trim();
		if (!group || !name) return;
		if (name === group.name) {
			renameDraft = null;
			return;
		}
		if ((await run('rename', () => onRename(group.id, name))) && selectedId === group.id) renameDraft = null;
	}

	async function togglePin() {
		const group = selectedGroup;
		if (!group) return;
		await run('pin', async () => {
			if (!(await onTogglePin(group.name))) throw new Error('The pin did not save. Try again.');
		});
	}

	async function moveMembers(control: 'add-people' | 'members', ids: string[], groupId: string | null) {
		const from = selectionKey;
		let unavailable = 0;
		const saved = await run(control, async () => {
			const result = await onMove(ids, groupId);
			unavailable = result.unavailableIds.length;
		});
		if (!saved || selectionKey !== from) return;
		checked = checked.filter((id) => !ids.includes(id));
		if (unavailable > 0)
			notice = `${unavailable} ${unavailable === 1 ? 'person was' : 'people were'} not moved. They were archived or are no longer on the roster.`;
	}

	function addPerson(value: string | string[]) {
		const id = Array.isArray(value) ? value[0] : value;
		addPeopleValue = '';
		if (id) void moveMembers('add-people', [id], targetGroupId);
	}

	function toggleMember(id: string, on: boolean) {
		checked = on ? [...checked, id] : checked.filter((checkedId) => checkedId !== id);
	}

	function toggleAll(on: boolean) {
		checked = on ? movableMembers.map((person) => person.id) : [];
	}

	async function startDelete() {
		const index = groups.findIndex((group) => group.id === selectedGroup?.id);
		moveTarget = groups[index + 1]?.id ?? UNASSIGNED;
		clearFailure('delete');
		confirmingDelete = true;
		await tick();
		(deletePicker ?? deleteCancel)?.focus();
	}

	async function cancelDelete() {
		confirmingDelete = false;
		clearFailure('delete');
		await tick();
		deleteTrigger?.focus();
	}

	async function confirmDelete() {
		const group = selectedGroup;
		if (!group) return;
		const index = groups.findIndex((candidate) => candidate.id === group.id);
		const target = members.length > 0 && moveTarget !== UNASSIGNED ? moveTarget : null;
		if (await run('delete', () => onDelete(group.id, target))) {
			confirmingDelete = false;
			if (selectedId === group.id) {
				selectedId =
					target ?? groups.filter((candidate) => candidate.id !== group.id)[Math.max(0, index - 1)]?.id ?? UNASSIGNED;
				checked = [];
			}
		}
	}
</script>

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content
		size="wide"
		class="h-dvh max-h-dvh max-w-none grid-rows-[auto_minmax(0,1fr)_auto] rounded-none sm:max-w-none lg:h-[min(41rem,calc(100dvh-4rem))] lg:max-w-[62.5rem] lg:rounded-xl"
	>
		<AppDialog.Header class="border-b border-border px-6 pt-5 pb-4">
			<AppDialog.Title class="font-heading text-[30px] leading-8 font-extrabold uppercase"
				>Manage Groups</AppDialog.Title
			>
			<AppDialog.Description>
				{groups.length}
				{groups.length === 1 ? 'Group' : 'Groups'} · {people.length} personnel · the order here is the order everywhere
			</AppDialog.Description>
		</AppDialog.Header>

		<div class="grid min-h-0 overflow-y-auto lg:grid-cols-[18.75rem_minmax(0,1fr)] lg:overflow-hidden">
			<section aria-label="Groups" class="flex min-h-0 flex-col border-border bg-muted max-lg:border-b lg:border-r">
				<Field.Root data-invalid={failures.add ? true : undefined} class="gap-1.5 p-4">
					<div class="flex gap-1.5">
						<Input
							bind:value={newGroupName}
							aria-label="New group name"
							placeholder="New group name"
							readonly={pending === 'add'}
							class="bg-background"
							oninput={() => clearFailure('add')}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									void addGroup();
								}
							}}
						/>
						<Button
							type="button"
							variant="outline"
							onclick={addGroup}
							disabled={!newGroupName.trim() || pending !== null}
						>
							Add
						</Button>
					</div>
					{#if failures.add}<Field.Error>{failures.add}</Field.Error>{/if}
				</Field.Root>

				<p
					class="px-4 pt-1 pb-2 font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase"
				>
					Drag to reorder
				</p>
				{#if failures.order}
					<p role="alert" class="px-4 pb-2 text-sm text-destructive-text">{failures.order}</p>
				{/if}

				<div class="min-h-0 lg:flex-1 lg:overflow-y-auto">
					{#if loading}
						<div class="grid gap-3 px-4 py-3" aria-busy="true" aria-label="Loading Groups">
							{#each [0, 1, 2, 3] as row (row)}
								<Skeleton class="h-6 w-full" />
							{/each}
						</div>
					{:else}
						<ReorderList {entries} onmove={move} aria-label="Groups in display order">
							{#each groups as group (group.id)}
								{@const selected = group.id === selectedId}
								<ReorderItem
									id={group.id}
									class={cn(
										'flex h-[46px] items-center gap-2.5 border-y border-l-[3px] border-transparent pr-4 pl-2.5',
										selected ? 'border-y-border border-l-accent bg-background' : 'hover:bg-background/60'
									)}
								>
									<ReorderGrip />
									<button
										type="button"
										aria-current={selected ? 'true' : undefined}
										class="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onclick={() => select(group.id)}
									>
										<span class={cn('min-w-0 flex-1 truncate text-[15px] leading-5', selected && 'font-semibold')}>
											{group.name}
										</span>
										<PinIcon
											aria-hidden="true"
											class={cn(
												'size-3.5 shrink-0 fill-accent text-accent',
												!pinnedNames.includes(group.name) && 'opacity-0'
											)}
										/>
										{#if pinnedNames.includes(group.name)}<span class="sr-only">Pinned</span>{/if}
										<span class="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
											{membersByGroup.get(group.id)?.length ?? 0}
										</span>
									</button>
								</ReorderItem>
							{/each}
						</ReorderList>
						<div class="border-t border-dashed border-border">
							<button
								type="button"
								aria-current={selectionKey === UNASSIGNED ? 'true' : undefined}
								class={cn(
									'flex h-[46px] w-full items-center gap-2.5 border-l-[3px] pr-4 pl-[2.625rem] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
									selectionKey === UNASSIGNED
										? 'border-l-accent bg-background'
										: 'border-l-transparent hover:bg-background/60'
								)}
								onclick={() => select(UNASSIGNED)}
							>
								<span
									class={cn(
										'min-w-0 flex-1 truncate text-[15px] leading-5 text-muted-foreground italic',
										selectionKey === UNASSIGNED && 'font-semibold'
									)}
								>
									Unassigned
								</span>
								<span class="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
									{membersByGroup.get(UNASSIGNED)?.length ?? 0}
								</span>
							</button>
						</div>
					{/if}
				</div>
			</section>

			<section
				bind:this={detailsRef}
				aria-label={selectedName}
				class="flex min-w-0 scroll-mt-4 flex-col gap-3 px-4 pb-4 sm:px-6 lg:min-h-0 lg:overflow-y-auto"
			>
				<div class="flex flex-wrap items-center gap-3 pt-[18px] pb-0.5">
					{#if renameDraft !== null && selectedGroup}
						<Field.Root data-invalid={failures.rename ? true : undefined} class="min-w-0 flex-1 gap-1.5">
							<div class="flex flex-wrap items-center gap-2">
								<Input
									bind:value={renameDraft}
									aria-label="Group name"
									readonly={pending === 'rename'}
									class="max-w-xs"
									oninput={() => clearFailure('rename')}
									onkeydown={(event) => {
										if (event.key === 'Enter') {
											event.preventDefault();
											void saveRename();
										} else if (event.key === 'Escape') {
											event.preventDefault();
											event.stopPropagation();
											renameDraft = null;
										}
									}}
								/>
								<Button type="button" size="sm" onclick={saveRename} disabled={!renameDraft.trim() || pending !== null}>
									Save
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={pending === 'rename'}
									onclick={() => {
										renameDraft = null;
										clearFailure('rename');
									}}
								>
									Cancel
								</Button>
							</div>
							{#if failures.rename}<Field.Error>{failures.rename}</Field.Error>{/if}
						</Field.Root>
					{:else}
						<h3 class="min-w-0 truncate font-heading text-[26px] leading-[30px] font-bold text-foreground uppercase">
							{selectedName}
						</h3>
						{#if selectedGroup}
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Rename {selectedGroup.name}"
								title="Rename"
								onclick={() => {
									renameDraft = selectedGroup.name;
									clearFailure('rename');
								}}
							>
								<PencilIcon aria-hidden="true" />
							</Button>
						{/if}
					{/if}
					{#if selectedGroup}
						<Button
							type="button"
							variant="outline"
							size="sm"
							aria-pressed={isPinned}
							disabled={pending === 'pin'}
							class={cn(isPinned && 'border-accent text-accent-text')}
							onclick={togglePin}
						>
							<PinIcon aria-hidden="true" class={cn(isPinned ? 'fill-accent text-accent' : 'text-muted-foreground')} />
							{isPinned ? 'Pinned to top' : 'Pin to top'}
						</Button>
					{/if}
				</div>
				{#if failures.pin}<p role="alert" class="-mt-2 text-sm text-destructive-text">{failures.pin}</p>{/if}

				{#if selectedGroup && addPeopleItems.length > 0}
					<Field.Root data-invalid={failures['add-people'] ? true : undefined} class="gap-1.5">
						<Combobox.Root
							items={addPeopleItems}
							bind:value={addPeopleValue}
							label="Add people"
							autoHighlight
							disabled={pending !== null}
							onValueChange={addPerson}
						>
							<Combobox.Trigger
								aria-label="Add people to {selectedGroup.name}"
								placeholder="Add people: search by name or rank, or pick from Unassigned"
								class="h-9 bg-background"
							>
								<span class="flex min-w-0 items-center gap-2 text-muted-foreground">
									<PlusIcon aria-hidden="true" class="size-3.5" />
									<span class="truncate">Add people: search by name or rank, or pick from Unassigned</span>
								</span>
							</Combobox.Trigger>
							<Combobox.Content>
								<Combobox.Search placeholder="Search by name or rank" />
								<Combobox.Empty>No one matches.</Combobox.Empty>
								<Combobox.List />
							</Combobox.Content>
						</Combobox.Root>
						{#if failures['add-people']}<Field.Error>{failures['add-people']}</Field.Error>{/if}
					</Field.Root>
				{/if}

				{#if checkedMembers.length > 0}
					<div
						class="flex min-h-11 flex-wrap items-center gap-2.5 rounded-md bg-foreground px-3 py-1.5 text-background"
						role="toolbar"
						aria-label="Selected members"
					>
						<span class="text-sm font-semibold">{checkedMembers.length} selected</span>
						<span class="flex-1"></span>
						{#if moveTargets.length > 0}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											type="button"
											size="sm"
											variant="outline"
											disabled={pending !== null}
											class="border-chrome-border bg-chrome-surface-muted text-chrome-text hover:bg-chrome-surface-muted/80 hover:text-chrome-text"
										>
											Move to…
											<ChevronDownIcon aria-hidden="true" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									{#each moveTargets as target (target.id)}
										<DropdownMenu.Item
											onSelect={() =>
												moveMembers(
													'members',
													checkedMembers.map((person) => person.id),
													target.id === UNASSIGNED ? null : target.id
												)}
										>
											{target.name}
										</DropdownMenu.Item>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
						{#if selectedGroup && canMoveTo(null)}
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={pending !== null}
								class="border border-chrome-border text-chrome-text hover:bg-chrome-surface-muted hover:text-chrome-text"
								onclick={() =>
									moveMembers(
										'members',
										checkedMembers.map((person) => person.id),
										null
									)}
							>
								Remove from Group
							</Button>
						{/if}
					</div>
				{/if}
				{#if failures.members}<p role="alert" class="text-sm text-destructive-text">{failures.members}</p>{/if}
				{#if notice}<p role="status" class="text-sm text-muted-foreground">{notice}</p>{/if}

				<div class="overflow-hidden rounded-md border border-border bg-background">
					<div
						class={cn(
							'grid h-8 items-center border-b border-border bg-muted px-3 font-mono text-[11px] leading-[14px] tracking-[0.08em] text-muted-foreground uppercase',
							memberColumns
						)}
					>
						<span>
							{#if movableMembers.length > 0}
								<Checkbox
									aria-label="Select all members of {selectedName}"
									checked={checkedMembers.length > 0 && checkedMembers.length === movableMembers.length}
									indeterminate={checkedMembers.length > 0 && checkedMembers.length < movableMembers.length}
									onCheckedChange={(on) => toggleAll(on === true)}
								/>
							{/if}
						</span>
						<span>Rank</span>
						<span>Members · {members.length}</span>
						<span class="max-sm:hidden">Duty role</span>
						{#if todayStatus}<span>Today</span>{/if}
					</div>
					{#if loading}
						<div class="grid gap-3 px-3 py-3" aria-busy="true" aria-label="Loading members">
							{#each [0, 1, 2] as row (row)}
								<Skeleton class="h-5 w-full" />
							{/each}
						</div>
					{:else if members.length === 0}
						<p class="px-3 py-6 text-center text-sm text-muted-foreground">
							{selectedGroup ? 'No one is in this Group yet.' : 'Everyone has a Group.'}
						</p>
					{:else}
						<ul aria-label="Members of {selectedName}">
							{#each members as person (person.id)}
								{@const isChecked = checked.includes(person.id)}
								{@const dot = todayStatus?.(person)}
								<li
									class={cn(
										'grid min-h-[42px] items-center border-b border-border px-3 last:border-b-0',
										memberColumns,
										isChecked && 'bg-muted'
									)}
								>
									<span>
										{#if canMovePerson(person)}
											<Checkbox
												aria-label="Select {personName(person)}"
												checked={isChecked}
												onCheckedChange={(on) => toggleMember(person.id, on === true)}
											/>
										{/if}
									</span>
									<span class="font-mono text-[13px] font-medium text-foreground">{person.rank}</span>
									<span class="truncate text-sm font-semibold text-foreground"
										>{person.lastName}, {person.firstName}</span
									>
									<span class="truncate text-sm text-muted-foreground max-sm:hidden">{person.clinicRole}</span>
									{#if dot}
										<span class="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
											{#if dot.kind === 'skeleton'}
												<Skeleton class="h-3 w-16" />
											{:else if dot.kind === 'present'}
												<span aria-hidden="true" class="size-[7px] shrink-0 rounded-full bg-success"></span>
												<span class="truncate">Present</span>
											{:else if dot.kind === 'away'}
												<span
													aria-hidden="true"
													class="size-[7px] shrink-0 rounded-full"
													style:background-color={dot.type.color}
												></span>
												<span class="truncate">{dot.type.name}</span>
											{/if}
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		</div>

		{#if confirmingDelete && selectedGroup}
			<div
				role="group"
				aria-label="Delete {selectedGroup.name}"
				class="flex flex-wrap items-center gap-4 border-t-2 border-destructive bg-destructive/5 px-6 py-4"
			>
				<div class="grid min-w-[min(100%,18rem)] flex-1 gap-0.5">
					<p class="text-[15px] leading-5 font-semibold text-foreground">Delete {selectedGroup.name}?</p>
					<p class="text-[13px] leading-[18px] text-muted-foreground">
						{#if members.length > 0}
							{members.length}
							{members.length === 1 ? 'member needs' : 'members need'} a new Group. Their records, notes and history are not
							affected.
						{:else}
							No one is in this Group.
						{/if}
					</p>
					{#if failures.delete}<p role="alert" class="text-sm text-destructive-text">{failures.delete}</p>{/if}
				</div>
				{#if members.length > 0}
					<label class="flex items-center gap-2 text-sm text-foreground">
						Move members to
						<NativeSelect.Root
							bind:ref={deletePicker}
							bind:value={moveTarget}
							class="w-[10.625rem]"
							disabled={pending === 'delete'}
						>
							{#each groups.filter((group) => group.id !== selectedGroup.id) as group (group.id)}
								<NativeSelect.Option value={group.id}>{group.name}</NativeSelect.Option>
							{/each}
							<NativeSelect.Option value={UNASSIGNED}>Unassigned</NativeSelect.Option>
						</NativeSelect.Root>
					</label>
				{/if}
				<div class="flex gap-2">
					<Button
						bind:ref={deleteCancel}
						type="button"
						variant="outline"
						disabled={pending === 'delete'}
						onclick={cancelDelete}
					>
						Cancel
					</Button>
					<Button type="button" variant="destructive" disabled={pending !== null} onclick={confirmDelete}>
						{members.length > 0 ? `Delete and move ${members.length}` : 'Delete'}
					</Button>
				</div>
			</div>
		{:else}
			<AppDialog.Footer class="items-center border-t border-border bg-muted px-6 py-3.5 sm:justify-between">
				{#if selectedGroup}
					<Button
						bind:ref={deleteTrigger}
						type="button"
						variant="ghost-destructive"
						onclick={startDelete}
						disabled={pending !== null}
					>
						<Trash2Icon aria-hidden="true" />
						Delete {selectedGroup.name}…
					</Button>
				{:else}
					<span></span>
				{/if}
				<div class="flex items-center gap-3.5">
					<span class="font-mono text-xs text-muted-foreground max-sm:hidden">Changes save as you go</span>
					<Button type="button" onclick={onClose} disabled={busy}>Done</Button>
				</div>
			</AppDialog.Footer>
		{/if}
	</AppDialog.Content>
</AppDialog.Root>
