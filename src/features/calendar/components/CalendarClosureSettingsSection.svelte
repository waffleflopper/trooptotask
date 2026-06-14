<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
	import { formatDate } from '$lib/utils/dates';
	import type { SpecialDay } from '$lib/types';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	let addClosureOpen = $state(false);
	let newSpecialDate = $state(formatDate(new Date()));
	let newSpecialName = $state('');
	let newSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

	let editClosureOpen = $state(false);
	let editingSpecialDay = $state<SpecialDay | null>(null);
	let editSpecialName = $state('');
	let editSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

	let confirmDeleteSpecial = $state<SpecialDay | null>(null);
	let showResetConfirm = $state(false);
	let filterYear = $state(String(new Date().getFullYear()));
	const addClosureDirty = $derived(
		newSpecialDate !== formatDate(new Date()) || newSpecialName.trim() !== '' || newSpecialType !== 'org-closure'
	);
	const editClosureDirty = $derived(
		Boolean(
			editingSpecialDay && (editSpecialName !== editingSpecialDay.name || editSpecialType !== editingSpecialDay.type)
		)
	);

	const yearOptions = $derived.by(() => {
		const y = new Date().getFullYear();
		return [y - 1, y, y + 1, y + 2].map(String);
	});

	const filteredDays = $derived(
		specialDaysStore.items
			.filter((d) => d.date.startsWith(`${filterYear}-`))
			.sort((a, b) => a.date.localeCompare(b.date))
	);

	const filteredClosures = $derived(
		filteredDays.filter((d) => !searchQuery || d.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	export function openAddDialog() {
		addClosureOpen = true;
	}

	function resetAddClosureForm() {
		newSpecialDate = formatDate(new Date());
		newSpecialName = '';
		newSpecialType = 'org-closure';
	}

	function closeAddClosureDialog() {
		resetAddClosureForm();
		addClosureOpen = false;
	}

	function closeEditClosureDialog() {
		editClosureOpen = false;
		editingSpecialDay = null;
	}

	function openEditSpecialDay(d: SpecialDay) {
		editingSpecialDay = d;
		editSpecialName = d.name;
		editSpecialType = d.type;
		editClosureOpen = true;
	}

	async function addSpecialDay() {
		if (!canMutate || !newSpecialDate || !newSpecialName.trim()) return;
		await specialDaysStore.add({ date: newSpecialDate, name: newSpecialName.trim(), type: newSpecialType });
		resetAddClosureForm();
		addClosureOpen = false;
	}

	async function saveEditSpecialDay() {
		if (!editingSpecialDay || !editSpecialName.trim()) return;
		const updated = await specialDaysStore.update(editingSpecialDay.id, {
			name: editSpecialName.trim(),
			type: editSpecialType
		});
		if (updated) {
			editClosureOpen = false;
			editingSpecialDay = null;
		}
	}

	async function deleteSpecialDay(d: SpecialDay) {
		if (!canMutate) return;
		await specialDaysStore.remove(d.id);
		confirmDeleteSpecial = null;
	}

	function formatDisplayDate(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function handleFilterYearChange(event: Event) {
		const selectedYear = (event.currentTarget as HTMLSelectElement).value;
		if (yearOptions.includes(selectedYear)) {
			filterYear = selectedYear;
		}
	}
</script>

<div class="mb-4 flex flex-wrap items-center gap-3">
	<Label
		for="calendar-settings-filter-year"
		class="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
	>
		Year
	</Label>
	<NativeSelect
		id="calendar-settings-filter-year"
		class="w-[6.5rem]"
		value={filterYear}
		onchange={handleFilterYearChange}
	>
		{#each yearOptions as year (year)}
			<option value={year}>{year}</option>
		{/each}
	</NativeSelect>
	<Badge variant="secondary" class="font-mono text-[10px]">{filteredClosures.length} days</Badge>
	{#if canMutate}
		<div class="ml-auto flex flex-col items-end gap-0.5">
			<Button variant="outline" size="sm" onclick={() => (showResetConfirm = true)}>Reset Federal Holidays</Button>
			<span class="font-mono text-[10px] text-muted-foreground">Preserves custom closures</span>
		</div>
	{/if}
</div>

<div class="space-y-1.5">
	{#each filteredClosures as day (day.id)}
		<div
			class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
		>
			<div class="w-28 shrink-0">
				<span class="text-sm tabular-nums text-muted-foreground">
					{formatDisplayDate(day.date)}
				</span>
			</div>
			<span class="flex-1 text-sm font-medium">{day.name}</span>
			<Badge variant={day.type === 'federal-holiday' ? 'default' : 'outline'} class="text-[10px]">
				{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
			</Badge>
			{#if canMutate}
				<div class="flex gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7"
						title="Edit closure"
						aria-label="Edit closure"
						onclick={() => openEditSpecialDay(day)}
					>
						<Pencil class="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7 text-destructive hover:text-destructive"
						title="Delete closure"
						aria-label="Delete closure"
						onclick={() => (confirmDeleteSpecial = day)}
					>
						<Trash2 class="size-3.5" />
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground"
		>
			No holidays or closures for {filterYear}. Add a closure or reset federal holidays to populate defaults.
		</div>
	{/each}
</div>

<AppDialog.Root bind:open={addClosureOpen} closeBlocked={addClosureDirty} onClose={closeAddClosureDialog}>
	<AppDialog.Content closeBlocked={addClosureDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Closure</AppDialog.Title>
			<AppDialog.Description>Mark a federal holiday or unit closure on the calendar.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-closure-date">Date</Label>
				<DatePicker bind:value={newSpecialDate} placeholder="Select date" />
			</div>
			<div class="grid gap-2">
				<Label for="add-closure-name">Name</Label>
				<Input
					id="add-closure-name"
					type="text"
					placeholder="e.g., Training Day, Independence Day"
					bind:value={newSpecialName}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="add-closure-type">Type</Label>
				<NativeSelect id="add-closure-type" bind:value={newSpecialType}>
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddClosureDialog}>Cancel</Button>
			<Button onclick={addSpecialDay} disabled={!newSpecialName.trim()}>Add Closure</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root bind:open={editClosureOpen} closeBlocked={editClosureDirty} onClose={closeEditClosureDialog}>
	<AppDialog.Content closeBlocked={editClosureDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Closure</AppDialog.Title>
			<AppDialog.Description>
				{#if editingSpecialDay}
					{formatDisplayDate(editingSpecialDay.date)}
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-closure-name">Name</Label>
				<Input id="edit-closure-name" type="text" bind:value={editSpecialName} />
			</div>
			<div class="grid gap-2">
				<Label for="edit-closure-type">Type</Label>
				<NativeSelect id="edit-closure-type" bind:value={editSpecialType}>
					<option value="org-closure">Closure</option>
					<option value="federal-holiday">Federal Holiday</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditClosureDialog}>Cancel</Button>
			<Button onclick={saveEditSpecialDay} disabled={!editSpecialName.trim()}>Save Changes</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDeleteSpecial}
	<ConfirmDialog
		title="Remove Special Day"
		message={`Remove "${confirmDeleteSpecial.name}"?`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteSpecial) deleteSpecialDay(confirmDeleteSpecial);
		}}
		onCancel={() => (confirmDeleteSpecial = null)}
	/>
{/if}

{#if showResetConfirm}
	<ConfirmDialog
		title="Reset Federal Holidays"
		message="Reset federal holidays to defaults? Custom closures will be preserved."
		confirmLabel="Reset"
		variant="warning"
		onConfirm={() => {
			specialDaysStore.resetFederalHolidays();
			showResetConfirm = false;
		}}
		onCancel={() => (showResetConfirm = false)}
	/>
{/if}
