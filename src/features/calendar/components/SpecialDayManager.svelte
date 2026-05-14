<script lang="ts">
	import type { SpecialDay } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';

	interface Props {
		specialDays: SpecialDay[];
		onAdd: (data: Omit<SpecialDay, 'id'>) => void;
		onRemove: (id: string) => void;
		onResetHolidays: () => void;
		onClose: () => void;
	}

	let { specialDays, onAdd, onRemove, onResetHolidays, onClose }: Props = $props();

	let newDate = $state(formatDate(new Date()));
	let newName = $state('');
	let newType = $state<'federal-holiday' | 'org-closure'>('org-closure');
	let filterYear = $state(new Date().getFullYear());

	const filteredDays = $derived(
		specialDays.filter((d) => d.date.startsWith(`${filterYear}-`)).sort((a, b) => a.date.localeCompare(b.date))
	);

	const yearOptions = $derived.by(() => {
		const currentYear = new Date().getFullYear();
		return [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
	});

	function handleAdd() {
		if (newDate && newName.trim()) {
			onAdd({
				date: newDate,
				name: newName.trim(),
				type: newType
			});
			newName = '';
		}
	}

	let confirmRemove = $state<SpecialDay | null>(null);
	let showResetConfirm = $state(false);

	function handleRemove(day: SpecialDay) {
		confirmRemove = day;
	}

	function doRemove() {
		if (confirmRemove) {
			onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}

	function handleResetHolidays() {
		showResetConfirm = true;
	}

	function doReset() {
		onResetHolidays();
		showResetConfirm = false;
	}

	function formatDisplayDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="special-day-title">Manage Holidays & Closures</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			<div class="grid gap-2 border-b pb-4 sm:grid-cols-[10rem_1fr_9rem_auto] sm:items-end">
				<Field.Root>
					<Field.Label>Date</Field.Label>
					<DatePicker bind:value={newDate} placeholder="Select date" />
				</Field.Root>
				<Field.Root>
					<Field.Label for="special-day-name">Name</Field.Label>
					<Input id="special-day-name" type="text" bind:value={newName} placeholder="Training Day" />
				</Field.Root>
				<Field.Root>
					<Field.Label for="special-day-type">Type</Field.Label>
					<NativeSelect id="special-day-type" bind:value={newType} class="w-full">
						<option value="org-closure">Closure</option>
						<option value="federal-holiday">Federal Holiday</option>
					</NativeSelect>
				</Field.Root>
				<Button size="sm" onclick={handleAdd} disabled={!newName.trim()}>Add</Button>
			</div>

			<div class="flex items-center gap-2">
				<label class="text-sm font-medium" for="special-day-filter-year">Year:</label>
				<NativeSelect id="special-day-filter-year" bind:value={filterYear} class="w-[100px]">
					{#each yearOptions as year (year)}
						<option value={year}>{year}</option>
					{/each}
				</NativeSelect>
				<span class="text-muted-foreground ml-auto text-sm">{filteredDays.length} days</span>
			</div>

			<div class="flex max-h-[350px] flex-col gap-1 overflow-y-auto">
				{#each filteredDays as day (day.id)}
					<div class="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2">
						<div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
							<span class="text-muted-foreground min-w-24 text-sm">{formatDisplayDate(day.date)}</span>
							<span class="min-w-0 truncate text-sm font-medium">{day.name}</span>
							<span
								class={[
									'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
									day.type === 'federal-holiday'
										? 'bg-secondary text-secondary-foreground'
										: 'bg-muted text-muted-foreground'
								]}
							>
								{day.type === 'federal-holiday' ? 'Holiday' : 'Closure'}
							</span>
						</div>
						<Button
							variant="destructive"
							size="icon-sm"
							onclick={() => handleRemove(day)}
							title="Remove"
							aria-label="Remove"
						>
							&times;
						</Button>
					</div>
				{:else}
					<div class="text-muted-foreground py-6 text-center text-sm">No holidays or closures for {filterYear}</div>
				{/each}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" onclick={handleResetHolidays}>Reset Federal Holidays</Button>
			<Button onclick={onClose}>Done</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmRemove}
	<ConfirmDialog
		title="Remove Special Day"
		message={`Remove "${confirmRemove.name}"?`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}

{#if showResetConfirm}
	<ConfirmDialog
		title="Reset Federal Holidays"
		message="Reset federal holidays to defaults? Custom closures will be preserved."
		confirmLabel="Reset"
		variant="warning"
		onConfirm={doReset}
		onCancel={() => (showResetConfirm = false)}
	/>
{/if}
