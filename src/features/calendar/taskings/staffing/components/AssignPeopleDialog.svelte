<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import type { GroupLabels, Tasking } from '../../taskingModel';
	import {
		outsideScopeLabel,
		personName,
		pickerRows,
		type StaffingPicker,
		type StaffingSaveResult,
		type TaskingStaffing
	} from '../staffingModel';
	import { loadStaffingPickerRequest, saveStaffingRequest } from '../staffingRequests';
	import { advisoryLabel, groupLabel, reviewLabel } from './staffingLabels';

	interface Props {
		orgId: string;
		tasking: Pick<Tasking, 'id' | 'responsibility' | 'requirement'>;
		groups: GroupLabels;
		onSaved: (result: StaffingSaveResult) => void;
		onClose: () => void;
	}

	let { orgId, tasking, groups, onSaved, onClose }: Props = $props();

	const ALL_GROUPS = '';
	const UNASSIGNED = 'unassigned';

	let picker = $state.raw<StaffingPicker | 'failed' | null>(null);
	const selected = new SvelteSet<string>();
	let removeOutsideScope = $state(false);
	let revision = $state(0);
	let initial = $state.raw<string[]>([]);
	let search = $state('');
	let groupFilter = $state(ALL_GROUPS);
	let conflict = $state.raw<TaskingStaffing | null>(null);
	let saveError = $state('');
	let open = true;
	const saving = new PendingSave();
	const countId = $props.id();

	$effect(() => () => (open = false));

	async function load() {
		picker = null;
		try {
			const loaded = await withinOrganizationLifetime(loadStaffingPickerRequest(orgId, tasking.id), () => open);
			const picked = loaded.staffing.picks.map((pick) => pick.personnelId);
			initial = picked;
			selected.clear();
			for (const id of picked) selected.add(id);
			revision = loaded.staffing.revision;
			picker = loaded;
		} catch {
			if (open) picker = 'failed';
		}
	}

	onMount(load);

	const organizationLevel = $derived(tasking.responsibility.kind === 'organization');
	const rows = $derived(typeof picker === 'object' && picker ? pickerRows(picker, tasking.responsibility) : []);
	const groupOptions = $derived(
		Object.entries(groups)
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const shown = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return rows.filter(
			(row) =>
				(!query || row.name.toLowerCase().includes(query)) &&
				(groupFilter === ALL_GROUPS ||
					(groupFilter === UNASSIGNED ? row.groupId === null : row.groupId === groupFilter))
		);
	});
	const outsideScope = $derived(typeof picker === 'object' && picker ? picker.staffing.outsideScope : 0);
	const dirty = $derived(
		removeOutsideScope || selected.size !== initial.length || initial.some((id) => !selected.has(id))
	);
	const required = $derived(tasking.requirement?.count ?? null);
	const countText = $derived(
		required === null ? `${selected.size} selected` : `${selected.size} selected of ${required} needed`
	);
	const conflictNames = $derived(conflict?.picks.map(personName) ?? []);

	function toggle(personnelId: string, checked: boolean) {
		if (checked) selected.add(personnelId);
		else selected.delete(personnelId);
	}

	function save() {
		void saving.run(async () => {
			saveError = '';
			try {
				const request = saveStaffingRequest(orgId, tasking.id, {
					personnelIds: [...selected],
					keep: [],
					removeOutsideScope,
					expectedRevision: revision
				});
				const result = await withinOrganizationLifetime(request, () => open);
				if (result.outcome !== 'conflict') {
					onSaved(result);
					return;
				}
				conflict = result.staffing;
				revision = result.staffing.revision;
			} catch (error) {
				if (open)
					saveError = rejectedRequestMessage(error, 'The people were not saved. Your choices are kept, so try again.');
			}
		});
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header class="border-b pb-4">
			<AppDialog.Title>Assign people</AppDialog.Title>
			<AppDialog.Description>
				{organizationLevel
					? 'Pick from the whole active roster.'
					: `Pick from the ${groups[tasking.responsibility.kind === 'group' ? tasking.responsibility.groupId : ''] ?? 'responsible Group'} roster.`}
				Conflicts are shown for awareness; they never stop a pick.
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid content-start gap-4">
			{#if saveError}
				<Alert.Root variant="destructive" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if conflict}
				<Alert.Root variant="warning" {@attach (alert) => alert.scrollIntoView({ block: 'nearest' })}>
					<Alert.Title>Someone else saved this list while you were choosing</Alert.Title>
					<Alert.Description>
						<p class="m-0">
							Saved now: {conflictNames.length > 0 ? conflictNames.join('; ') : 'nobody'}{conflict.outsideScope > 0
								? `; ${outsideScopeLabel(conflict.outsideScope)}`
								: ''}.
						</p>
						<p class="m-0">Your choices are still selected below. Save again to replace their list with yours.</p>
					</Alert.Description>
				</Alert.Root>
			{/if}

			{#if picker === null}
				<div class="grid gap-3" role="status" aria-label="Loading roster">
					<Skeleton class="h-9 w-full" />
					{#each [0, 1, 2, 3, 4] as placeholder (placeholder)}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else if picker === 'failed'}
				<Alert.Root variant="destructive">
					<Alert.Title>The roster could not be loaded</Alert.Title>
					<Alert.Description>Nothing has changed. Try again in a moment.</Alert.Description>
					<div class="mt-3"><Button variant="outline" onclick={load}>Retry</Button></div>
				</Alert.Root>
			{:else}
				{#if picker.advisories.kind === 'no_execution'}
					<Alert.Root>
						<Alert.Description>
							This tasking has no execution dates, so nobody can be checked for conflicts.
						</Alert.Description>
					</Alert.Root>
				{:else if picker.advisories.kind === 'failed'}
					<Alert.Root variant="warning">
						<Alert.Description>
							Conflicts could not be checked. Anyone below may already be committed over these dates.
						</Alert.Description>
					</Alert.Root>
				{/if}

				<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
					<Field.Root>
						<Field.Label for="assign-people-search">Search</Field.Label>
						<Input id="assign-people-search" type="search" placeholder="Name or rank" bind:value={search} />
					</Field.Root>
					{#if organizationLevel}
						<Field.Root>
							<Field.Label for="assign-people-group">Group</Field.Label>
							<NativeSelect id="assign-people-group" bind:value={groupFilter}>
								<NativeSelectOption value={ALL_GROUPS}>All Groups</NativeSelectOption>
								{#each groupOptions as group (group.id)}
									<NativeSelectOption value={group.id}>{group.name}</NativeSelectOption>
								{/each}
								<NativeSelectOption value={UNASSIGNED}>Unassigned</NativeSelectOption>
							</NativeSelect>
						</Field.Root>
					{/if}
				</div>

				<p id={countId} class="m-0 text-sm font-medium tabular-nums" aria-live="polite">{countText}</p>

				{#if shown.length === 0}
					<p class="m-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
						{rows.length === 0 ? 'Nobody on this roster is active.' : 'Nobody matches this search.'}
					</p>
				{:else}
					<ul class="divide-y rounded-lg border" aria-describedby={countId}>
						{#each shown as row (row.personnelId)}
							{@const advisories =
								picker.advisories.kind === 'loaded' ? (picker.advisories.byPerson[row.personnelId] ?? []) : []}
							{@const inputId = `assign-${row.personnelId}`}
							<li class="flex items-start gap-3 px-3 py-2.5">
								<Checkbox
									id={inputId}
									class="mt-0.5"
									checked={selected.has(row.personnelId)}
									onCheckedChange={(checked) => toggle(row.personnelId, checked)}
									disabled={saving.pending}
								/>
								<label for={inputId} class="grid min-w-0 flex-1 cursor-pointer gap-0.5">
									<span class="font-medium">{row.name}</span>
									{#if organizationLevel || row.review}
										<span class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
											{#if organizationLevel}<span>{groupLabel(row.groupId, groups)}</span>{/if}
											{#if row.review}
												<Badge variant="warning">Needs review</Badge>
												<span>{reviewLabel(row.review, row.groupId, groups)}</span>
											{/if}
										</span>
									{/if}
									{#each advisories as advisory, index (index)}
										<span class="text-sm text-warning-foreground">{advisoryLabel(advisory)}</span>
									{/each}
								</label>
							</li>
						{/each}
					</ul>
				{/if}

				{#if outsideScope > 0}
					<div class="flex items-start gap-3 rounded-lg border px-3 py-2.5">
						<Checkbox
							id="assign-remove-outside"
							class="mt-0.5"
							bind:checked={removeOutsideScope}
							disabled={saving.pending}
						/>
						<label for="assign-remove-outside" class="grid cursor-pointer gap-0.5">
							<span class="font-medium">Remove {outsideScopeLabel(outsideScope)}</span>
							<span class="text-sm text-muted-foreground">Left alone, they stay picked.</span>
						</label>
					</div>
				{/if}
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer class="border-t pt-4">
			<Button variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
			<Button
				onclick={save}
				disabled={saving.pending || typeof picker !== 'object' || picker === null || (!dirty && !conflict)}
			>
				{#if saving.pending}<Spinner />{/if}
				Save people
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
