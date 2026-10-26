<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import { rankCodesForOptions, type Personnel, type RankCatalogEntry } from '$features/personnel/contracts';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { personnelTrainingsStore } from '../stores/personnelTrainings.svelte';
	import { trainingTypesStore } from '../stores/trainingTypes.svelte';
	import type { TrainingPageAccess } from '../contracts';
	import type { TrainingType } from '../training.types';
	import { renewalTimeline } from '../utils/trainingRenewalTimeline';
	import {
		applicabilityMatches,
		newTrainingTypeDraft,
		trainingTypeDraftFrom,
		trainingTypeInputFromDraft,
		validateTrainingTypeDraft,
		type ApplicabilityChip,
		type ApplicabilityDraft,
		type RenewalDraft
	} from '../utils/trainingTypeDraft';
	import ApplicabilityChipField from './ApplicabilityChipField.svelte';

	let {
		org,
		type,
		position,
		catalogSize,
		nextSortOrder,
		personnel,
		rankCatalog,
		today,
		onSaved,
		onDeleted,
		returnFocus,
		onClose
	}: {
		/** Nothing is written once the page shows another Organization than the one the sheet opened in. */
		org: TrainingPageAccess;
		/** The type being edited, or null for a new one that goes to the end of the order. */
		type: TrainingType | null;
		/** The edited type's place in the column order. */
		position: number;
		catalogSize: number;
		nextSortOrder: number;
		/** Active personnel, who the applies-to counts and name previews come from. */
		personnel: Personnel[];
		rankCatalog: RankCatalogEntry[] | undefined;
		today: string;
		onSaved: (typeId: string) => void;
		onDeleted: () => void;
		/** Puts focus back where the sheet came from; the page knows whether that row or button still exists. */
		returnFocus: () => void;
		onClose: () => void;
	} = $props();

	const openedIn = untrack(() => org.orgId);
	const SWATCHES = [
		{ color: '#4a6a9a', name: 'Blue' },
		{ color: '#6b8a52', name: 'Green' },
		{ color: '#3d8b8b', name: 'Teal' },
		{ color: '#6f6a9a', name: 'Indigo' },
		{ color: '#8a5a8f', name: 'Purple' },
		{ color: '#8a6a4a', name: 'Brown' },
		{ color: '#6b7280', name: 'Gray' },
		{ color: '#4a5568', name: 'Slate' }
	];
	const RENEWAL_OPTIONS = [
		{ value: 'months', label: 'Every few months' },
		{ value: 'cardDate', label: 'Date on the card' },
		{ value: 'never', label: 'Never expires' }
	] as const;
	const MODE_OPTIONS = [
		{ value: 'everyone', label: 'Everyone' },
		{ value: 'onlySome', label: 'Only some' },
		{ value: 'optional', label: 'Optional' }
	] as const;
	const PREVIEW_NAMES = 5;

	const saving = new PendingSave();
	let alive = true;
	onDestroy(() => (alive = false));
	const stillHere = () => alive && org.orgId === openedIn;

	let draft = $state(
		untrack(() => (type ? trainingTypeDraftFrom(type) : { ...newTrainingTypeDraft(), sortOrder: nextSortOrder }))
	);
	const savedDraft = JSON.stringify(draft);
	const dirty = $derived(JSON.stringify(draft) !== savedDraft);
	let showExcept = $state(untrack(() => draft.applicability.except.length > 0));
	let attempted = $state(false);
	let touched = $state<Record<string, boolean>>({});
	let error = $state('');
	let confirmingDelete = $state(false);
	let deleteError = $state('');
	let deleting = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);
	let form = $state<HTMLFormElement | null>(null);

	const errors = $derived(validateTrainingTypeDraft(draft));
	const shown = (field: keyof typeof errors) => (attempted || touched[field] ? errors[field] : undefined);
	const touch = (field: string) => () => (touched[field] = true);

	const renewal = $derived(draft.renewal);
	const applicability = $derived(draft.applicability);
	const matches = $derived(applicabilityMatches(applicability, personnel));
	const timeline = $derived(
		renewal.kind === 'months'
			? renewalTimeline(today, renewal.months, renewal.firstWarningDays, renewal.finalWarningDays)
			: null
	);
	const exemptNow = $derived(personnel.filter((person) => draft.exemptPersonnelIds.includes(person.id)).length);

	const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
	const options = $derived<ApplicabilityChip[]>([
		...distinct(personnel.map((person) => person.clinicRole)).map((value) => ({ kind: 'role' as const, value })),
		...distinct(personnel.map((person) => person.mos)).map((value) => ({ kind: 'mos' as const, value })),
		...rankCodesForOptions({
			rankCatalog,
			observedRanks: personnel.map((person) => person.rank),
			preserveRanks: [...applicability.only, ...applicability.except]
				.filter((chip) => chip.kind === 'rank')
				.map((chip) => chip.value)
		}).map((value) => ({ kind: 'rank' as const, value }))
	]);

	const title = $derived(type ? type.name : draft.name.trim() || 'Untitled type');
	const eyebrow = $derived(
		type
			? `Edit training type · ${position} of ${catalogSize}`
			: `New training type · ${catalogSize + 1} of ${catalogSize + 1}`
	);
	const appliesLine = $derived(`Applies to ${matches.matched.length} of ${personnel.length} personnel`);

	function names(people: Personnel[]): string {
		const shownNames = people.slice(0, PREVIEW_NAMES).map((person) => `${person.rank} ${person.lastName}`.trim());
		const more = people.length - PREVIEW_NAMES;
		return more > 0 ? `${shownNames.join(', ')} and ${more} more` : shownNames.join(', ');
	}

	function chooseRenewal(kind: RenewalDraft['kind']) {
		if (kind === renewal.kind) return;
		const preserved = draft.preservedRenewalFields;
		const warnings =
			renewal.kind === 'never'
				? { firstWarningDays: preserved.warningDaysYellow, finalWarningDays: preserved.warningDaysOrange }
				: { firstWarningDays: renewal.firstWarningDays, finalWarningDays: renewal.finalWarningDays };
		const months = renewal.kind === 'months' ? renewal.months : (preserved.expirationMonths ?? 12);
		draft.renewal =
			kind === 'months' ? { kind, months, ...warnings } : kind === 'cardDate' ? { kind, ...warnings } : { kind };
	}

	function chooseMode(mode: ApplicabilityDraft['mode']) {
		draft.applicability.mode = mode;
		if (mode === 'optional') {
			draft.applicability.only = [];
			draft.applicability.except = [];
			showExcept = false;
		} else if (mode === 'everyone') {
			draft.applicability.only = [];
		}
	}

	function setNumber(field: 'months' | 'firstWarningDays' | 'finalWarningDays', event: Event) {
		const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
		const current = draft.renewal;
		if (current.kind === 'never') return;
		if (field === 'months') {
			if (current.kind === 'months') current.months = value;
		} else current[field] = value;
	}

	const numberValue = (value: number) => (Number.isNaN(value) ? '' : value);

	async function focusFirstInvalid() {
		await tick();
		form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}

	function submit() {
		attempted = true;
		if (Object.keys(errors).length > 0) void focusFirstInvalid();
		else void saving.run(save);
	}

	async function save() {
		error = '';
		const savingDraft = { ...draft, name: draft.name.trim(), description: draft.description?.trim() || null };
		const {
			exemptPersonnelIds: _exemptPersonnelIds,
			sortOrder: _sortOrder,
			...fields
		} = trainingTypeInputFromDraft(savingDraft, 'update');
		try {
			const saved = type
				? (await trainingTypesStore.updateOrThrow(type.id, fields)) && type.id
				: (await trainingTypesStore.add(trainingTypeInputFromDraft(savingDraft)))?.id;
			if (!stillHere()) return;
			if (!saved) {
				error = 'Failed to save training type.';
				return;
			}
			onSaved(saved);
		} catch (failure) {
			if (stillHere()) error = rejectedRequestMessage(failure, 'Failed to save training type.');
		}
	}

	async function deleteType(target: TrainingType) {
		deleting = true;
		deleteError = '';
		try {
			const result = await trainingTypesStore.remove(target.id);
			if (org.orgId !== openedIn) return;
			if (result === 'deleted') personnelTrainingsStore.removeByTrainingTypeLocal(target.id);
			if (!alive) return;
			if (result === 'error') {
				deleteError = 'Failed to delete training type. Try again.';
				return;
			}
			confirmingDelete = false;
			onDeleted();
		} finally {
			deleting = false;
		}
	}
</script>

{#snippet section(heading: string, aside?: string)}
	<div class="flex items-baseline justify-between gap-3">
		<h3 class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{heading}</h3>
		{#if aside}
			<p class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{aside}</p>
		{/if}
	</div>
{/snippet}

{#snippet unit(label: string)}
	<span
		class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
		aria-hidden="true">{label}</span
	>
{/snippet}

<AppDialog.Root open busy={saving.pending || deleting} closeBlocked={dirty} {onClose}>
	<AppDialog.Content
		presentation="sheet"
		size="wide"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			nameInput?.focus();
		}}
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			returnFocus();
		}}
	>
		<AppDialog.Header class="gap-1.5 border-b px-7 pt-6 pb-4" {eyebrow}>
			<AppDialog.Title class="font-heading text-3xl leading-8 font-extrabold uppercase">{title}</AppDialog.Title>
			<AppDialog.Description>{appliesLine}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="p-0">
			<form
				bind:this={form}
				id="training-type-form"
				class="divide-y"
				novalidate
				onsubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<fieldset class="contents" disabled={saving.pending || deleting}>
					<div class="grid gap-4 px-7 py-6">
						{@render section('Basics')}
						<div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
							<Field.Root>
								<Field.Label for="type-name">Name</Field.Label>
								<Input
									id="type-name"
									bind:ref={nameInput}
									value={draft.name}
									oninput={(event) => (draft.name = event.currentTarget.value)}
									onblur={touch('name')}
									maxlength={100}
									placeholder="e.g. Hazmat certification"
								/>
								{#if shown('name')}<Field.Error>{shown('name')}</Field.Error>{/if}
							</Field.Root>
							<Field.Root>
								<Field.Title id="type-color-label">Color</Field.Title>
								<div class="flex flex-wrap items-center gap-2">
									<ToggleGroup.Root
										type="single"
										class="flex-wrap gap-2 bg-transparent p-0"
										aria-labelledby="type-color-label"
										bind:value={
											() => (SWATCHES.some((swatch) => swatch.color === draft.color) ? draft.color : ''),
											(value) => {
												if (value) draft.color = value;
											}
										}
									>
										{#each SWATCHES as swatch (swatch.color)}
											<ToggleGroup.Item
												value={swatch.color}
												aria-label={swatch.name}
												class="size-7 min-w-7 rounded-md p-0 ring-offset-2 ring-offset-background data-[state=on]:ring-2 data-[state=on]:ring-foreground"
												style="background-color: {swatch.color}"
											/>
										{/each}
									</ToggleGroup.Root>
									<Input
										type="color"
										aria-label="Custom color"
										class="size-7 cursor-pointer rounded-md border-dashed p-0.5"
										bind:value={draft.color}
									/>
								</div>
							</Field.Root>
						</div>
						<Field.Root>
							<div class="flex items-baseline justify-between">
								<Field.Label for="type-description">Description</Field.Label>
								<span class="text-[13px] text-muted-foreground">Optional</span>
							</div>
							<Input
								id="type-description"
								value={draft.description ?? ''}
								oninput={(event) => (draft.description = event.currentTarget.value)}
								placeholder="What it covers, or who teaches it"
							/>
						</Field.Root>
					</div>

					<div class="grid gap-4 px-7 py-6">
						{@render section('Renewal')}
						<SegmentedFilter.Root
							label="Renewal"
							options={RENEWAL_OPTIONS}
							bind:value={() => renewal.kind, chooseRenewal}
						/>
						{#if renewal.kind !== 'never'}
							<div class="grid gap-4 sm:grid-cols-3">
								{#if renewal.kind === 'months'}
									<Field.Root>
										<Field.Label for="type-months">Good for</Field.Label>
										<div class="relative">
											<Input
												id="type-months"
												type="number"
												min="1"
												max="120"
												class="pr-20"
												value={numberValue(renewal.months)}
												oninput={(event) => setNumber('months', event)}
												onblur={touch('months')}
											/>
											{@render unit('months')}
										</div>
										{#if shown('months')}<Field.Error>{shown('months')}</Field.Error>{/if}
									</Field.Root>
								{/if}
								<Field.Root>
									<Field.Label for="type-first-warning">First warning</Field.Label>
									<div class="relative">
										<Input
											id="type-first-warning"
											type="number"
											min="1"
											class="pr-20"
											value={numberValue(renewal.firstWarningDays)}
											oninput={(event) => setNumber('firstWarningDays', event)}
											onblur={touch('firstWarningDays')}
										/>
										{@render unit('days out')}
									</div>
									{#if shown('firstWarningDays')}<Field.Error>{shown('firstWarningDays')}</Field.Error>{/if}
								</Field.Root>
								<Field.Root>
									<Field.Label for="type-final-warning">Final warning</Field.Label>
									<div class="relative">
										<Input
											id="type-final-warning"
											type="number"
											min="0"
											class="pr-20"
											value={numberValue(renewal.finalWarningDays)}
											oninput={(event) => setNumber('finalWarningDays', event)}
											onblur={touch('finalWarningDays')}
										/>
										{@render unit('days out')}
									</div>
									{#if shown('finalWarningDays')}<Field.Error>{shown('finalWarningDays')}</Field.Error>{/if}
								</Field.Root>
							</div>
						{/if}
						{#if timeline}
							<div class="grid gap-2" data-testid="renewal-timeline">
								<div class="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
									<span
										class="absolute inset-y-0 border border-warning bg-warning/25"
										style="left: {timeline.firstWarningShare * 100}%; width: {Math.max(
											0,
											timeline.finalWarningShare - timeline.firstWarningShare
										) * 100}%"
									></span>
									<span
										class="absolute inset-y-0 bg-destructive"
										style="left: {timeline.finalWarningShare * 100}%; right: 0"
									></span>
								</div>
								<p
									class="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.06em] text-muted-foreground uppercase"
								>
									<span>Done {formatDayMonthYear(timeline.done)}</span>
									<span>
										Warn {formatDayMonthYear(timeline.firstWarning)} · {formatDayMonthYear(timeline.finalWarning)}
									</span>
									<span class="text-danger-foreground">Expires {formatDayMonthYear(timeline.expires)}</span>
								</p>
							</div>
						{:else if renewal.kind === 'cardDate'}
							<p class="text-sm text-muted-foreground">Each person's own card date sets when these warnings start.</p>
						{/if}
					</div>

					<div class="grid gap-4 px-7 py-6">
						{@render section('Who needs it', `${matches.matched.length} of ${personnel.length} personnel`)}
						<SegmentedFilter.Root
							label="Who needs it"
							options={MODE_OPTIONS}
							bind:value={() => applicability.mode, chooseMode}
						/>
						{#if applicability.mode === 'optional'}
							<p class="text-sm text-muted-foreground">
								Tracked but not required. People without a record show as not required, and people with one show their
								status.
							</p>
						{:else}
							{#if applicability.mode === 'onlySome'}
								<Field.Root>
									<Field.Label for="type-only">Only</Field.Label>
									<ApplicabilityChipField
										id="type-only"
										label="Only these roles, MOS and ranks"
										{options}
										bind:chips={draft.applicability.only}
									/>
									<p class="text-sm text-muted-foreground">
										{#if applicability.only.length === 0}
											Add a role, MOS or rank, or choose Everyone.
										{:else if matches.matched.length === 0}
											Matches nobody.
										{:else}
											Matches {matches.matched.length}: {names(matches.matched)}
										{/if}
									</p>
								</Field.Root>
							{/if}
							{#if showExcept}
								<Field.Root>
									<Field.Label for="type-except">Except</Field.Label>
									<ApplicabilityChipField
										id="type-except"
										label="Except these roles, MOS and ranks"
										{options}
										bind:chips={draft.applicability.except}
									/>
									<p class="text-sm text-muted-foreground">
										{#if matches.removedByExcept.length === 0}
											Excludes nobody.
										{:else}
											Excludes {matches.removedByExcept.length}: {names(matches.removedByExcept)}
										{/if}
									</p>
								</Field.Root>
							{:else}
								<Button
									type="button"
									variant="link"
									size="none"
									class="w-fit text-foreground underline"
									onclick={() => (showExcept = true)}
								>
									+ Add an exception
								</Button>
							{/if}
						{/if}
					</div>

					<div class="grid gap-4 px-7 py-6">
						{@render section('Exemptions')}
						<Field.Root orientation="horizontal" class="items-start">
							<Checkbox id="type-exemptions" bind:checked={draft.canBeExempted} />
							<Field.Content>
								<Field.Label for="type-exemptions">Allow exemptions</Field.Label>
								<Field.Description>
									Leaders can mark a person exempt from their record sheet.
									{#if exemptNow > 0}{exemptNow} {exemptNow === 1 ? 'is' : 'are'} exempt now.{/if}
								</Field.Description>
							</Field.Content>
						</Field.Root>
					</div>

					{#if error}
						<div class="px-7 py-4">
							<Alert.Root variant="destructive" role="alert">
								<Alert.Description class="text-current">{error}</Alert.Description>
							</Alert.Root>
						</div>
					{/if}
				</fieldset>
			</form>
		</AppDialog.Body>

		<AppDialog.Footer class="items-center border-t px-7 py-4 sm:justify-between">
			{#if type}
				<Button
					variant="link"
					size="none"
					class="text-destructive underline"
					disabled={saving.pending || deleting}
					onclick={() => {
						deleteError = '';
						confirmingDelete = true;
					}}
				>
					Delete type
				</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<Button variant="outline" disabled={saving.pending || deleting} onclick={onClose}>Cancel</Button>
				<Button type="submit" form="training-type-form" disabled={saving.pending || deleting}>
					{type ? 'Save changes' : 'Create type'}
				</Button>
			</div>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmingDelete && type}
	<ConfirmDialog
		title="Delete Training Type"
		message="Are you sure you want to delete '{type.name}'? All associated training records will also be deleted. This cannot be undone."
		confirmLabel="Delete"
		onConfirm={() => deleteType(type)}
		onCancel={() => (confirmingDelete = false)}
	>
		{#if deleteError}
			<Alert.Root variant="destructive"><Alert.Description>{deleteError}</Alert.Description></Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}
