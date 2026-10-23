<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { NEW_STATUS_TYPE_COLORS, type StatusEffectChange, type StatusType } from '$features/calendar/contracts';
	import type { RosterEffect } from '$features/calendar/roster/rosterTypes';
	import { ROSTER_EFFECT_OPTIONS, statusEffectChangeText } from '$features/calendar/utils/rosterEffects';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import {
		fitsOneDayLabel,
		normalizeShortLabel,
		ONE_DAY_LABEL_LENGTH,
		StatusBar,
		suggestOneDayLabel
	} from '$lib/components/patterns/calendar-bars';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDate } from '$lib/utils/dates';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import RosterCodeChip from './RosterCodeChip.svelte';

	interface Props {
		/** The type to edit in place. Without it the composer adds a new type. */
		status?: StatusType;
		/** Cancel and a successful save close at once. */
		onClose: () => void;
		/** Escape asks to close, so the owner can confirm before unsaved changes go. */
		onDismiss: () => void;
	}

	let { status, onClose, onDismiss }: Props = $props();

	const WHITE_TEXT = NEW_STATUS_TYPE_COLORS.textColor;
	const DARK_TEXT = '#1c1b19';
	const SWATCHES = [
		{ color: '#48bb78', name: 'Green' },
		{ color: '#4299e1', name: 'Blue' },
		{ color: '#9f7aea', name: 'Purple' },
		{ color: '#ed8936', name: 'Orange' },
		{ color: '#e53e3e', name: 'Red' },
		{ color: '#a0522d', name: 'Brown' },
		{ color: '#319795', name: 'Teal' },
		{ color: '#4a5568', name: 'Slate' }
	] as const;
	const DEFAULT_COLOR = NEW_STATUS_TYPE_COLORS.color;
	const DEFAULT_EFFECT: RosterEffect = 'A';
	const PREVIEW_FAILURE = "We couldn't check which duty roster numbers change.";

	const initial = untrack(() => status);
	const id = initial?.id ?? 'new';
	let name = $state(initial?.name ?? '');
	// A saved label shows as typed; with none saved the field follows the name until someone types in it.
	let typedLabel = $state<string | null>(initial?.shortLabel ?? null);
	let color = $state(initial?.color ?? DEFAULT_COLOR);
	let textColor = $state(initial?.textColor ?? WHITE_TEXT);
	let rosterEffect = $state<RosterEffect>(initial?.rosterEffect ?? DEFAULT_EFFECT);
	// Editing an effect lists the numbers it changes before saving. A failed look stays unsaved.
	let review = $state<
		{ kind: 'changes'; changes: StatusEffectChange[]; saveError?: string } | { kind: 'failed'; message: string } | null
	>(null);
	let alive = true;
	let nameInput = $state<HTMLInputElement | null>(null);
	let fields = $state<HTMLFieldSetElement | null>(null);
	const saving = new PendingSave();

	const draft = $derived({
		name: name.trim(),
		shortLabel: typedLabel === null ? null : normalizeShortLabel(typedLabel),
		color,
		textColor,
		rosterEffect
	});
	const shownLabel = $derived(draft.shortLabel ?? suggestOneDayLabel(draft.name));
	const labelFits = $derived(fitsOneDayLabel(draft.shortLabel ?? ''));
	const valid = $derived(draft.name !== '' && labelFits);
	const dirty = $derived(
		initial
			? draft.name !== initial.name ||
					draft.shortLabel !== initial.shortLabel ||
					color !== initial.color ||
					textColor !== initial.textColor ||
					rosterEffect !== initial.rosterEffect
			: draft.name !== '' ||
					typedLabel !== null ||
					color !== DEFAULT_COLOR ||
					textColor !== WHITE_TEXT ||
					rosterEffect !== DEFAULT_EFFECT
	);
	const textChoice = $derived(textColor === WHITE_TEXT ? 'white' : textColor === DARK_TEXT ? 'dark' : '');
	const swatch = $derived(SWATCHES.some((option) => option.color === color) ? color : '');
	const previewName = $derived(draft.name || 'Status');
	const previewLabel = $derived(shownLabel || suggestOneDayLabel(previewName));

	export function isDirty() {
		return dirty;
	}

	onMount(() => nameInput?.focus());
	onDestroy(() => (alive = false));

	function save() {
		if (!valid) return Promise.resolve();
		return initial && rosterEffect !== initial.rosterEffect ? reviewEffect(initial) : commit();
	}

	// Nothing to confirm when no number changes, so the save goes straight through.
	async function reviewEffect(saved: StatusType) {
		let changes: StatusEffectChange[];
		try {
			changes = await statusTypesStore.previewEffect(saved.id, rosterEffect, formatDate(new Date()));
		} catch (error) {
			if (alive) review = { kind: 'failed', message: rejectedRequestMessage(error, PREVIEW_FAILURE) };
			return;
		}
		if (!alive) return;
		if (changes.length === 0) await commit();
		else review = { kind: 'changes', changes };
	}

	async function retryReview() {
		if (initial) await reviewEffect(initial);
	}

	// Saves and closes. A failure goes to `report` and leaves the composer open.
	async function commit(report: (message: string) => void = (message) => toastStore.error(message)) {
		const failure = initial ? 'Failed to save status type' : 'Failed to add status type';
		try {
			const saved = initial
				? await statusTypesStore.updateOrThrow(initial.id, draft)
				: await statusTypesStore.add(draft);
			if (!saved) {
				report(failure);
				return;
			}
		} catch (error) {
			report(rejectedRequestMessage(error, failure));
			return;
		}
		if (alive) onClose();
	}

	// The dialog stays up and the form stays locked until the save settles, so edits cannot slip in underneath it.
	function confirmReview() {
		return saving.run(async () => {
			if (review?.kind !== 'changes') return;
			review = { ...review, saveError: undefined };
			await commit((message) => {
				if (alive && review?.kind === 'changes') review = { ...review, saveError: message };
			});
		});
	}
</script>

<svelte:document
	onkeydown={(event) => {
		if (event.key !== 'Escape' || saving.pending || !fields?.contains(event.target as Node)) return;
		event.preventDefault();
		onDismiss();
	}}
/>

<form
	class="flex w-full flex-col gap-5 rounded-lg border-2 border-foreground bg-card p-5"
	aria-label={initial ? `Edit ${initial.name}` : 'New status type'}
	onsubmit={(event) => {
		event.preventDefault();
		void saving.run(save);
	}}
>
	<fieldset bind:this={fields} class="contents" disabled={saving.pending}>
		<div class="flex flex-wrap items-start gap-4">
			<Field.Root class="min-w-48 flex-1">
				<Field.Label for="status-{id}-name">Name</Field.Label>
				<Input
					id="status-{id}-name"
					type="text"
					placeholder="e.g., Leave, TDY, School"
					bind:ref={nameInput}
					bind:value={name}
				/>
			</Field.Root>
			<Field.Root class="w-32">
				<Field.Label for="status-{id}-label">One-day label</Field.Label>
				<Input
					id="status-{id}-label"
					type="text"
					class="font-mono uppercase"
					maxlength={ONE_DAY_LABEL_LENGTH}
					aria-invalid={!labelFits}
					value={typedLabel ?? shownLabel}
					oninput={(event) => (typedLabel = event.currentTarget.value)}
				/>
				<Field.Description>Up to 3 letters</Field.Description>
			</Field.Root>
			<Field.Root class="w-auto">
				<Field.Title id="status-{id}-text">Text</Field.Title>
				<ToggleGroup.Root
					type="single"
					aria-labelledby="status-{id}-text"
					bind:value={
						() => textChoice,
						(value) => {
							if (value === 'white') textColor = WHITE_TEXT;
							if (value === 'dark') textColor = DARK_TEXT;
						}
					}
				>
					<ToggleGroup.Item value="white">White</ToggleGroup.Item>
					<ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
				</ToggleGroup.Root>
			</Field.Root>
		</div>
		<Field.Root>
			<Field.Title id="status-{id}-color">Color</Field.Title>
			<div class="flex flex-wrap items-center gap-2">
				<ToggleGroup.Root
					type="single"
					class="flex-wrap gap-2 bg-transparent p-0"
					aria-labelledby="status-{id}-color"
					bind:value={
						() => swatch,
						(value) => {
							if (value) color = value;
						}
					}
				>
					{#each SWATCHES as option (option.color)}
						<ToggleGroup.Item
							value={option.color}
							aria-label={option.name}
							class="size-7 min-w-7 rounded-md p-0 ring-offset-2 ring-offset-card data-[state=on]:ring-2 data-[state=on]:ring-foreground"
							style="background-color: {option.color}"
						/>
					{/each}
				</ToggleGroup.Root>
				<Input
					type="color"
					aria-label="Custom color"
					class="size-7 cursor-pointer rounded-md border-dashed p-0.5"
					bind:value={color}
				/>
			</div>
		</Field.Root>
		<Field.Root>
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<Field.Title id="status-{id}-effect">On duty rosters</Field.Title>
				<Field.Description>
					What this status does to someone's turn. Codes follow DA PAM 220-45, para 7c.
				</Field.Description>
			</div>
			<RadioGroup.Root
				aria-labelledby="status-{id}-effect"
				class="grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
				bind:value={
					() => rosterEffect,
					(value) => {
						rosterEffect = value as RosterEffect;
					}
				}
			>
				{#each ROSTER_EFFECT_OPTIONS as option (option.value)}
					<TypeWorkspace.Choice
						class="p-0 transition-colors has-data-[state=checked]:border-foreground has-data-[state=checked]:bg-background"
					>
						<label for="status-{id}-effect-{option.value}" class="flex h-full cursor-pointer flex-col gap-1.5 p-3">
							<span class="flex items-center gap-2 text-sm font-medium">
								<RadioGroup.Item id="status-{id}-effect-{option.value}" value={option.value} />
								{option.title}
								{#if option.code}<RosterCodeChip code={option.code} class="ml-auto" />{/if}
							</span>
							<span class="text-sm text-muted-foreground">{option.summary} {option.examples}</span>
						</label>
					</TypeWorkspace.Choice>
				{/each}
			</RadioGroup.Root>
		</Field.Root>
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					Preview
				</span>
				<div class="flex flex-wrap items-center gap-2" aria-hidden="true">
					<StatusBar status={draft} label={{ kind: 'one-day', text: previewLabel }} />
					<StatusBar class="w-24" status={draft} label={{ kind: 'name', text: previewName }} />
					<StatusBar
						class="w-44"
						status={draft}
						label={{ kind: 'name-note', name: previewName, note: 'Sample note' }}
					/>
				</div>
				<p class="text-sm text-muted-foreground">One day · two to three days · room for the note</p>
			</div>
			<div class="ml-auto flex gap-2">
				<Button type="button" variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
				<Button type="submit" disabled={saving.pending || statusTypesStore.orderBusy || !valid || !dirty}>
					{#if saving.pending}<Spinner />{/if}
					{initial ? 'Save changes' : 'Add status type'}
				</Button>
			</div>
		</div>
	</fieldset>
</form>

{#if review}
	<ConfirmDialog
		title={review.kind === 'failed' ? "Couldn't check roster numbers" : 'Change what this status does?'}
		message={review.kind === 'failed'
			? `${review.message} The status is not saved.`
			: 'Saving recalculates the open DA 6 forms below. Closed forms keep their saved numbers.'}
		confirmLabel={review.kind === 'failed' ? 'Try again' : 'Save changes'}
		variant="default"
		onConfirm={review.kind === 'failed' ? retryReview : confirmReview}
		onCancel={() => (review = null)}
	>
		{#if review.kind === 'changes'}
			<ul
				class="max-h-64 divide-y overflow-y-auto rounded-md border text-sm"
				aria-label="Numbers that change on open DA 6 forms"
			>
				{#each review.changes as change (`${change.assignmentTypeId}:${change.personId}:${change.track}`)}
					<li class="px-3 py-2">{statusEffectChangeText(change)}</li>
				{/each}
			</ul>
			{#if review.saveError}
				<p role="alert" class="text-sm text-destructive">{review.saveError}</p>
			{/if}
		{/if}
	</ConfirmDialog>
{/if}
