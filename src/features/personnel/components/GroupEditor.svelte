<script lang="ts" module>
	export const UNASSIGNED = 'unassigned';
</script>

<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Group } from '$features/personnel/contracts';
	import type { Personnel } from '../personnel.types';
	import type { RosterStatusDot } from '../rosterSignals';
	import type { GroupStructureCommands } from '../groupStructureCommands';
	import { groupPickerOptions, UNASSIGNED_OPTION } from '../groupStructure';
	import { buildGroupTree } from '../groupTree';
	import type { GroupMembershipChange } from '../utils/moveGroupMembers';
	import GroupTreeEditor from './GroupTreeEditor.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { TreeSelect } from '$lib/components/patterns/tree-select';
	import { cn } from '$lib/utils';
	import PinIcon from '@lucide/svelte/icons/pin';
	import PlusIcon from '@lucide/svelte/icons/plus';

	type Control = 'pin' | 'add-people' | 'members';

	interface Props {
		groups: readonly Group[];
		people: Personnel[];
		pinnedGroupIds: readonly string[];
		loading?: boolean;
		initialSelection?: string | null;
		todayStatus?: (person: Personnel) => RosterStatusDot;
		canMovePerson: (person: Personnel) => boolean;
		canMoveTo: (groupId: string | null) => boolean;
		commands: GroupStructureCommands;
		onTogglePin: (groupId: string) => Promise<boolean>;
		onMove: (personnelIds: string[], groupId: string | null) => Promise<GroupMembershipChange>;
		onClose: () => void;
	}

	let {
		groups,
		people,
		pinnedGroupIds,
		loading = false,
		initialSelection = null,
		todayStatus,
		canMovePerson,
		canMoveTo,
		commands,
		onTogglePin,
		onMove,
		onClose
	}: Props = $props();

	let selectedId = $state<string>(untrack(() => initialSelection ?? buildGroupTree(groups).roots[0]?.id ?? UNASSIGNED));
	let checked = $state<string[]>([]);
	let pending = $state<Control | null>(null);
	let requestVersion = 0;
	let failures = $state<Partial<Record<Control, string>>>({});
	let notice = $state<string | null>(null);
	let treeBusy = $state(false);
	let treeDirty = $state(false);
	let addPeopleValue = $state('');
	let detailsRef = $state<HTMLElement | null>(null);

	const tree = $derived(buildGroupTree(groups));
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
	const selectedName = $derived(selectedGroup ? tree.label(selectedGroup.id) : 'Unassigned');
	const members = $derived(membersByGroup.get(selectionKey) ?? []);
	const memberColumns = $derived(
		todayStatus
			? 'grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_6.875rem] sm:grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_12.5rem_6.875rem]'
			: 'grid-cols-[1.75rem_3.25rem_minmax(0,1fr)] sm:grid-cols-[1.75rem_3.25rem_minmax(0,1fr)_12.5rem]'
	);
	const movableMembers = $derived(members.filter(canMovePerson));
	const checkedMembers = $derived(members.filter((person) => checked.includes(person.id)));
	const targetGroupId = $derived(selectedGroup?.id ?? null);
	const isPinned = $derived(selectedGroup ? pinnedGroupIds.includes(selectedGroup.id) : false);
	const busy = $derived(pending !== null || treeBusy);
	const noGroups = $derived(!loading && groups.length === 0);

	const moveOptions = $derived(
		groupPickerOptions(tree, {
			disabled: (id) => id === selectionKey || !canMoveTo(id),
			unassigned: selectionKey !== UNASSIGNED && canMoveTo(null) ? 'Unassigned' : undefined
		})
	);
	const canMoveSomewhere = $derived(moveOptions.some((option) => !option.disabled));

	const addPeopleItems = $derived.by(() => {
		if (!selectedGroup || !canMoveTo(selectedGroup.id)) return [];
		const order = new Map(tree.ordered.map((group, index) => [group.id, index]));
		const rank = (person: Personnel) =>
			person.groupId && groupIds.has(person.groupId) ? (order.get(person.groupId) ?? 0) + 1 : 0;
		return people
			.filter((person) => person.groupId !== selectedGroup.id && canMovePerson(person))
			.toSorted((a, b) => rank(a) - rank(b))
			.map((person) => ({
				value: person.id,
				label: personName(person),
				description: person.clinicRole || undefined,
				group: person.groupId && groupIds.has(person.groupId) ? tree.label(person.groupId) : 'Unassigned'
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
			if (request === requestVersion && selectionKey === groupId) {
				failures = { ...failures, [control]: messageOf(cause) };
			}
			return false;
		} finally {
			pending = null;
		}
	}

	async function select(id: string) {
		if (id === selectedId) return;
		requestVersion++;
		selectedId = id;
		checked = [];
		notice = null;
		failures = {};
		if (!window.matchMedia('(min-width: 64rem)').matches) {
			await tick();
			detailsRef?.scrollIntoView({ block: 'start' });
		}
	}

	async function togglePin() {
		const group = selectedGroup;
		if (!group) return;
		await run('pin', async () => {
			if (!(await onTogglePin(group.id))) throw new Error('The pin did not save. Try again.');
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

	function moveChecked(value: string) {
		void moveMembers(
			'members',
			checkedMembers.map((person) => person.id),
			value === UNASSIGNED_OPTION ? null : value
		);
	}

	function toggleMember(id: string, on: boolean) {
		checked = on ? [...checked, id] : checked.filter((checkedId) => checkedId !== id);
	}

	function toggleAll(on: boolean) {
		checked = on ? movableMembers.map((person) => person.id) : [];
	}
</script>

<AppDialog.Root open {busy} closeBlocked={treeDirty} {onClose}>
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

		<div class="grid min-h-0 overflow-y-auto lg:grid-cols-[22rem_minmax(0,1fr)] lg:overflow-hidden">
			<section aria-label="Groups" class="flex flex-col border-border bg-muted max-lg:border-b lg:min-h-0 lg:border-r">
				<div class="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
					<GroupTreeEditor
						{groups}
						{people}
						{commands}
						{loading}
						selectedId={selectionKey}
						onSelect={select}
						pinnedIds={pinnedGroupIds}
						bind:busy={treeBusy}
						bind:dirty={treeDirty}
					/>
					{#if noGroups}
						<div class="p-4 pt-0">
							<p
								class="rounded-sm border border-dashed border-muted-foreground/40 p-3.5 text-[13px] leading-[18px] text-muted-foreground"
							>
								Your Groups line up here, in the order the roster shows them.
							</p>
						</div>
					{:else if !loading}
						<div class="border-t border-dashed border-border">
							<button
								type="button"
								aria-current={selectionKey === UNASSIGNED ? 'true' : undefined}
								class={cn(
									'flex h-11 w-full items-center gap-2.5 border-l-[3px] pr-[4.625rem] pl-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

			{#if noGroups}
				<section
					aria-labelledby="first-group-heading"
					class="flex min-w-0 flex-col justify-center gap-2.5 px-4 py-8 sm:px-6 lg:px-18"
				>
					<p class="font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
						No Groups yet
					</p>
					<h3
						id="first-group-heading"
						class="font-heading text-[26px] leading-[30px] font-bold text-foreground uppercase"
					>
						Name your first Group
					</h3>
					<p class="max-w-[420px] text-[15px] leading-[22px] text-muted-foreground">
						Start with the sections you report on, like HQ Section, 1st Platoon or Maintenance. Once a Group exists,
						this side lists who is in it and lets you add people.
					</p>
				</section>
			{:else}
				<section
					bind:this={detailsRef}
					aria-label={selectedName}
					class="flex min-w-0 scroll-mt-4 flex-col gap-3 px-4 pb-4 sm:px-6 lg:min-h-0 lg:overflow-y-auto"
				>
					<div class="flex flex-wrap items-center gap-3 pt-[18px] pb-0.5">
						<h3 class="min-w-0 truncate font-heading text-[26px] leading-[30px] font-bold text-foreground uppercase">
							{selectedName}
						</h3>
						{#if selectedGroup && selectedGroup.parentId === null}
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-pressed={isPinned}
								disabled={pending === 'pin'}
								class={cn(isPinned && 'border-accent text-accent-text')}
								onclick={togglePin}
							>
								<PinIcon
									aria-hidden="true"
									class={cn(isPinned ? 'fill-accent text-accent' : 'text-muted-foreground')}
								/>
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
							{#if canMoveSomewhere}
								<TreeSelect
									label="Move selected members to"
									hideLabel
									placeholder="Move to…"
									searchPlaceholder="Search Groups"
									value={null}
									valueLabel={null}
									options={moveOptions}
									onValueChange={moveChecked}
									class="h-8 w-auto max-w-60"
								/>
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

					{#if selectedGroup && !loading && people.length === 0}
						<div class="grid gap-1.5 rounded-sm border border-dashed border-muted-foreground/40 px-6 py-7">
							<p class="text-[15px] leading-5 font-semibold text-foreground">No one in {selectedGroup.name} yet</p>
							<p class="max-w-[460px] text-sm leading-5 text-muted-foreground">
								A Group column in your roster spreadsheet fills Groups on import, or add people here once they are on
								the roster.
							</p>
						</div>
					{:else}
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
					{/if}
				</section>
			{/if}
		</div>

		<AppDialog.Footer class="items-center border-t border-border bg-muted px-6 py-3.5 sm:justify-end">
			<span class="font-mono text-xs text-muted-foreground max-sm:hidden">Changes save as you go</span>
			<Button type="button" onclick={onClose} disabled={busy}>Done</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
