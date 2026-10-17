<script lang="ts">
	import { tick } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { specialDaysStore, type FederalHolidayResetResult } from '$features/calendar/stores/specialDays.svelte';
	import { closureListView, type ClosureListMonth } from '$features/calendar/utils/closureDays';
	import { getDefaultFederalHolidays } from '$features/calendar/utils/federalHolidays';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { formatToday, getDayName, getMonthName, parseDate } from '$lib/utils/dates';
	import type { SpecialDay } from '$features/calendar/contracts';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import ClosureComposer from './ClosureComposer.svelte';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	type TypeFilter = 'all' | 'federal' | 'closures';

	let { canMutate, searchQuery }: Props = $props();

	let composerOpen = $state(false);
	// Each opening gets a fresh composer, so a discarded draft never survives a second New closure.
	let composerSession = $state(0);
	let composerView = $state<ClosureComposer>();
	let confirmDiscard = $state(false);
	let addOpener: HTMLElement | null = null;

	let editClosureOpen = $state(false);
	let editingSpecialDay = $state<SpecialDay | null>(null);
	let editSpecialName = $state('');
	let editSpecialType = $state<'federal-holiday' | 'org-closure'>('org-closure');

	let confirmDeleteSpecial = $state<SpecialDay | null>(null);
	const saving = new PendingSave();
	let showResetConfirm = $state(false);
	let filterYear = $state(String(new Date().getFullYear()));
	let typeFilter = $state<TypeFilter>('all');
	const editClosureDirty = $derived(
		Boolean(
			editingSpecialDay && (editSpecialName !== editingSpecialDay.name || editSpecialType !== editingSpecialDay.type)
		)
	);

	const yearOptions = $derived.by(() => {
		const y = new Date().getFullYear();
		return [y - 1, y, y + 1, y + 2].map(String);
	});
	const defaultYears = $derived.by(() => {
		const defaults = getDefaultFederalHolidays();
		return `${defaults[0].date.slice(0, 4)}–${defaults[defaults.length - 1].date.slice(0, 4)}`;
	});

	const query = $derived(searchQuery.trim().toLowerCase());
	const shownDays = $derived(
		specialDaysStore.items.filter(
			(day) =>
				day.date.startsWith(`${filterYear}-`) &&
				(typeFilter === 'all' || (typeFilter === 'federal') === (day.type === 'federal-holiday')) &&
				(!query || day.name.toLowerCase().includes(query))
		)
	);
	const view = $derived(closureListView(shownDays, Number(filterYear), formatToday()));

	export function openAddDialog() {
		if (!canMutate || composerOpen) return;
		addOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		composerSession++;
		composerOpen = true;
	}

	function dismissComposer() {
		if (composerView?.isDirty()) confirmDiscard = true;
		else void closeComposer();
	}

	async function closeComposer() {
		composerOpen = false;
		confirmDiscard = false;
		await tick();
		addOpener?.focus();
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

	function showClosureMutationError(message: string, error?: unknown) {
		toastStore.error(error instanceof Error ? error.message : message);
	}

	async function saveEditSpecialDay() {
		if (!editingSpecialDay || !editSpecialName.trim()) return;
		try {
			const updated = await specialDaysStore.updateOrThrow(editingSpecialDay.id, {
				name: editSpecialName.trim(),
				type: editSpecialType
			});
			if (!updated) {
				showClosureMutationError('Failed to save closure');
				return;
			}
			editClosureOpen = false;
			editingSpecialDay = null;
		} catch (error) {
			showClosureMutationError(rejectedRequestMessage(error, 'Failed to save closure'));
		}
	}

	async function deleteSpecialDay(d: SpecialDay) {
		if (!canMutate) return;
		try {
			const removed = await specialDaysStore.remove(d.id);
			if (!removed) {
				showClosureMutationError('Failed to delete closure');
				return;
			}
			confirmDeleteSpecial = null;
		} catch (error) {
			showClosureMutationError('Failed to delete closure', error);
		}
	}

	const RESET_MESSAGES = {
		saved: null,
		stale: null,
		'not-saved': 'Failed to reset federal holidays',
		'saved-unrefreshed': 'Holiday reset saved, but Calendar could not refresh. Reload to see the latest days.',
		unconfirmed: "We couldn't confirm the holiday reset. The list shows the saved days. Reset again if needed.",
		'unconfirmed-unrefreshed': "We couldn't confirm the holiday reset. Reload to see the saved days."
	} satisfies Record<FederalHolidayResetResult, string | null>;

	async function resetFederalHolidays() {
		if (!canMutate) return;
		const result = await specialDaysStore.resetFederalHolidays();
		if (result !== 'not-saved') showResetConfirm = false;
		const message = RESET_MESSAGES[result];
		if (message) showClosureMutationError(message);
	}

	function formatDisplayDate(dateStr: string): string {
		return parseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
	}

	function dayCount(n: number): string {
		return `${n} ${n === 1 ? 'day' : 'days'}`;
	}

	// A range never crosses a month, so its first and last day share one.
	function rangeDays(days: SpecialDay[]): string {
		return `${parseDate(days[0].date).getDate()}–${parseDate(days[days.length - 1].date).getDate()}`;
	}

	function handleFilterYearChange(event: Event) {
		const selectedYear = (event.currentTarget as HTMLSelectElement).value;
		if (yearOptions.includes(selectedYear)) {
			filterYear = selectedYear;
		}
	}
</script>

{#snippet dayRow(day: SpecialDay, nested: boolean)}
	{@const date = parseDate(day.date)}
	<li class={['flex items-center gap-3 px-4 py-3', nested && 'bg-muted/30 pl-10']}>
		<span class="flex w-16 shrink-0 items-baseline gap-1.5">
			<span class="font-display text-xl leading-none font-bold tabular-nums">{date.getDate()}</span>
			<span class="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{getDayName(date)}</span>
		</span>
		<span class="min-w-0 flex-1 text-sm font-medium break-words">{day.name}</span>
		<Badge variant={day.type === 'federal-holiday' ? 'default' : 'warning'}>
			{day.type === 'federal-holiday' ? 'Federal' : 'Closure'}
		</Badge>
		{#if canMutate}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							size="icon-sm"
							variant="ghost"
							aria-label="More actions for {day.name}, {formatDisplayDate(day.date)}"
						>
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onSelect={() => openEditSpecialDay(day)}>Edit</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onSelect={() => (confirmDeleteSpecial = day)}>
						Remove
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</li>
{/snippet}

{#snippet monthGroups(months: ClosureListMonth[])}
	{#each months as group (group.month)}
		<section class="flex flex-col gap-2" aria-labelledby="closures-month-{filterYear}-{group.month}">
			<h4 id="closures-month-{filterYear}-{group.month}" class="font-display text-sm font-bold tracking-wide uppercase">
				{getMonthName(group.month)}
			</h4>
			<ul class="divide-y rounded-md border bg-card">
				{#each group.rows as row (row.kind === 'day' ? row.day.id : row.days[0].id)}
					{#if row.kind === 'day'}
						{@render dayRow(row.day, false)}
					{:else}
						{@const first = parseDate(row.days[0].date)}
						{@const last = parseDate(row.days[row.days.length - 1].date)}
						<li>
							<Collapsible.Root>
								<Collapsible.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="cell"
											size="none"
											class="group/range w-full justify-start gap-3 px-4 py-3 text-left whitespace-normal"
											aria-label="{row.name}, {dayCount(row.days.length)} from {formatDisplayDate(
												row.days[0].date
											)} to {formatDisplayDate(row.days[row.days.length - 1].date)}"
										>
											<span class="w-16 shrink-0 font-display text-xl leading-none font-bold tabular-nums">
												{rangeDays(row.days)}
											</span>
											<span class="flex min-w-0 flex-1 flex-col gap-0.5">
												<span class="text-sm font-medium break-words">{row.name}</span>
												<span class="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
													{getDayName(first)} – {getDayName(last)} · {dayCount(row.days.length)}
												</span>
											</span>
											<Badge variant="warning">Closure</Badge>
											<ChevronRight
												class="size-4 shrink-0 transition-transform group-data-[state=open]/range:rotate-90"
												aria-hidden="true"
											/>
										</Button>
									{/snippet}
								</Collapsible.Trigger>
								<Collapsible.Content>
									<ul class="divide-y border-t">
										{#each row.days as day (day.id)}
											{@render dayRow(day, true)}
										{/each}
									</ul>
								</Collapsible.Content>
							</Collapsible.Root>
						</li>
					{/if}
				{/each}
			</ul>
		</section>
	{/each}
{/snippet}

<div class={['grid gap-6', canMutate && 'xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-[auto_1fr]']}>
	<div class="flex flex-wrap items-center gap-3 xl:col-start-1 xl:row-start-1">
		<NativeSelect aria-label="Year" class="w-[6.5rem]" value={filterYear} onchange={handleFilterYearChange}>
			{#each yearOptions as year (year)}
				<option value={year}>{year}</option>
			{/each}
		</NativeSelect>
		<ToggleGroup.Root
			type="single"
			size="sm"
			aria-label="Show"
			bind:value={() => typeFilter, (value) => value && (typeFilter = value as TypeFilter)}
		>
			<ToggleGroup.Item value="all">All</ToggleGroup.Item>
			<ToggleGroup.Item value="federal">Federal</ToggleGroup.Item>
			<ToggleGroup.Item value="closures">Closures</ToggleGroup.Item>
		</ToggleGroup.Root>
	</div>

	{#if canMutate}
		<div class="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-span-2 xl:row-start-1">
			{#if composerOpen}
				{#key composerSession}
					<ClosureComposer bind:this={composerView} onClose={closeComposer} onDismiss={dismissComposer} />
				{/key}
			{/if}
			<Card.Root class="flex flex-wrap items-center gap-3 px-4 py-3">
				<div class="flex min-w-48 flex-1 flex-col gap-1">
					<Card.Title>Federal holidays</Card.Title>
					<Card.Description>Restore the standard list for {defaultYears}. Custom closures are kept.</Card.Description>
				</div>
				<Button variant="outline" size="sm" onclick={() => (showResetConfirm = true)}>Reset</Button>
			</Card.Root>
		</div>
	{/if}

	<div class="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-start-2">
		{#if view.past}
			{@const past = view.past}
			<Collapsible.Root>
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							class="group/past w-full justify-start gap-2 border-dashed text-left font-normal text-muted-foreground"
						>
							<ChevronRight
								class="size-4 shrink-0 transition-transform group-data-[state=open]/past:rotate-90"
								aria-hidden="true"
							/>
							<span class="flex-1">
								{past.throughMonth === 0 ? 'January' : `January – ${getMonthName(past.throughMonth)}`}
							</span>
							<span class="font-mono text-[10px] tracking-wide uppercase">
								{past.dayCount} past {past.dayCount === 1 ? 'day' : 'days'}
							</span>
						</Button>
					{/snippet}
				</Collapsible.Trigger>
				<Collapsible.Content class="flex flex-col gap-5 pt-5">
					{@render monthGroups(past.months)}
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
		{@render monthGroups(view.months)}
		{#if !view.past && view.months.length === 0}
			<p class="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
				No holidays or closures for {filterYear}.
			</p>
		{/if}
	</div>
</div>

<AppDialog.Root
	bind:open={editClosureOpen}
	busy={saving.pending}
	closeBlocked={editClosureDirty}
	onClose={closeEditClosureDialog}
>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Edit Closure</AppDialog.Title>
			<AppDialog.Description>
				{#if editingSpecialDay}
					{formatDisplayDate(editingSpecialDay.date)}
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<fieldset class="contents" disabled={saving.pending}>
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
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditClosureDialog} disabled={saving.pending}>Cancel</Button>
			<Button onclick={() => saving.run(saveEditSpecialDay)} disabled={saving.pending || !editSpecialName.trim()}>
				{#if saving.pending}<Spinner />{/if}
				Save Changes
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDiscard}
	<ConfirmDialog
		title="Discard changes?"
		message="This closure is not saved."
		confirmLabel="Discard"
		onConfirm={closeComposer}
		onCancel={() => (confirmDiscard = false)}
	/>
{/if}

{#if confirmDeleteSpecial}
	<ConfirmDialog
		title="Remove Special Day"
		message={`Remove "${confirmDeleteSpecial.name}"?`}
		confirmLabel="Remove"
		onConfirm={() => {
			if (confirmDeleteSpecial) return deleteSpecialDay(confirmDeleteSpecial);
		}}
		onCancel={() => (confirmDeleteSpecial = null)}
	/>
{/if}

{#if showResetConfirm}
	<ConfirmDialog
		title="Reset Federal Holidays"
		message="Reset federal holidays to defaults? Custom closures will be preserved."
		confirmLabel="Reset"
		variant="default"
		onConfirm={resetFederalHolidays}
		onCancel={() => (showResetConfirm = false)}
	/>
{/if}
