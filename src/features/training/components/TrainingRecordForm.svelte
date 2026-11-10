<script lang="ts">
	import { onDestroy, tick, untrack, type Snippet } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining, TrainingRecordSave, TrainingType } from '$features/training/training.types';
	import { calculateExpirationDate } from '$features/training/utils/trainingStatus';
	import { renewalMode } from '$features/training/utils/cellDisplayText';
	import { classifyWrite, rejectedRequestMessage } from '$lib/stores/core';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		person: Personnel;
		type: TrainingType;
		training: PersonnelTraining | undefined;
		orgId: string;
		/** The Organization's calendar day: the default completion date. */
		today: string;
		/** True while the surface that shows this form is still open on this person and type. */
		isCurrent: () => boolean;
		/** Start from the record's stored date instead of today, so a correction does not move the completion. */
		keepRecordedDate?: boolean;
		/** A save elsewhere on the surface is in flight: hold this one back. */
		busy?: boolean;
		onSave: (data: TrainingRecordSave) => void | Promise<void>;
		/** Runs after a save that this form is still showing; `isUpdate` is true when it replaced a record. */
		onSaved?: (isUpdate: boolean) => void;
		/** Reports whether the date or an extra differs from what the form opened with; false once it goes. */
		onDirtyChange?: (dirty: boolean) => void;
		/** Context shown above the date field, ruled off from it. */
		header?: Snippet;
		/** Anything that belongs under Save; given true while this form's save is in flight. */
		footer?: Snippet<[boolean]>;
	}

	let {
		person,
		type,
		training,
		orgId,
		today,
		isCurrent,
		keepRecordedDate = false,
		busy = false,
		onSave,
		onSaved,
		onDirtyChange,
		header,
		footer
	}: Props = $props();

	const uid = $props.id();
	const startOrgId = untrack(() => orgId);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const stillHere = () => !disposed && orgId === startOrgId && isCurrent();

	const kind = $derived(renewalMode(type));
	const initialDate = untrack(() => {
		if (keepRecordedDate && training) {
			return (type.expirationDateOnly ? training.expirationDate : training.completionDate) ?? '';
		}
		return type.expirationDateOnly ? '' : today;
	});
	let date = $state(initialDate);
	const storedNotes = untrack(() => training?.notes ?? '');
	let notes = $state(storedNotes);
	let showExtras = $state(Boolean(storedNotes));
	let saving = $state(false);
	let saveError = $state<{ outcome: 'not-saved'; message: string } | { outcome: 'unconfirmed' } | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	$effect(() => {
		onDirtyChange?.(date !== initialDate || notes !== storedNotes);
		return () => onDirtyChange?.(false);
	});

	// Only a date-only type stores its expiration date; the others show a preview and save none.
	const storedExpirationDate = $derived(kind === 'cardDate' ? date || null : null);
	const expirationDate = $derived(
		kind === 'cardDate'
			? storedExpirationDate
			: kind === 'months'
				? calculateExpirationDate(date, type.expirationMonths)
				: null
	);
	// A never-expiring completion may be stored without a date; editing it keeps that allowed.
	const dateOptional = untrack(() => kind === 'never' && keepRecordedDate && !!training && !training.completionDate);
	const canSave = $derived((date !== '' || dateOptional) && !saving && !busy);

	const preview = $derived.by(() => {
		if (kind === 'never') return date || dateOptional ? { ok: true, text: 'Never expires' } : null;
		if (!expirationDate) return null;
		const label = formatDayMonthYear(expirationDate);
		return expirationDate >= today
			? { ok: true, text: `Current until ${label}` }
			: { ok: false, text: `Expired ${label}` };
	});

	// The date field is a button, so Enter would open its calendar instead of saving.
	function submitOnEnterInDate(event: KeyboardEvent) {
		if (event.key !== 'Enter' || !(event.target instanceof HTMLElement) || event.target.id !== `${uid}-date`) return;
		event.preventDefault();
		event.stopPropagation();
		formElement?.requestSubmit();
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!canSave || !stillHere()) return;
		const isUpdate = !!training;
		saving = true;
		saveError = null;
		try {
			await onSave({
				personnelId: person.id,
				trainingTypeId: type.id,
				completionDate: kind === 'cardDate' ? (training?.completionDate ?? null) : date || null,
				expirationDate: storedExpirationDate,
				notes: notes.trim() || null
			});
			if (!stillHere()) return;
			onSaved?.(isUpdate);
		} catch (error) {
			if (!stillHere()) return;
			saveError =
				classifyWrite(error) === 'not-saved'
					? { outcome: 'not-saved', message: rejectedRequestMessage(error, 'Could not save.') }
					: { outcome: 'unconfirmed' };
		} finally {
			if (stillHere()) {
				saving = false;
				if (saveError) {
					await tick();
					if (stillHere()) formElement?.querySelector<HTMLElement>('button[type="submit"]')?.focus();
				}
			}
		}
	}
</script>

<form bind:this={formElement} class="grid grid-cols-1 gap-3" onsubmit={save} onkeydowncapture={submitOnEnterInDate}>
	{@render header?.()}
	<Field.Root class={['gap-1.5', header && 'border-t border-border pt-3']}>
		<div class="flex items-center justify-between gap-2">
			<Field.Label for="{uid}-date" class="font-mono text-[0.6875rem] tracking-[0.08em] uppercase">
				{kind === 'cardDate' ? 'Expires on' : 'Completed'}
			</Field.Label>
			{#if kind !== 'cardDate' && date === today}
				<span class="font-mono text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">Today</span>
			{/if}
		</div>
		<DatePicker id="{uid}-date" bind:value={date} disabled={saving || busy} />
		{#if preview}
			<p class={['flex items-center gap-1.5 text-sm', preview.ok ? 'text-foreground' : 'text-danger-foreground']}>
				{#if preview.ok}<CheckIcon class="size-3.5 text-success-foreground" aria-hidden="true" />{/if}
				{preview.text}
			</p>
		{:else if kind === 'cardDate'}
			<p class="text-sm text-muted-foreground">Enter the date shown on the card.</p>
		{/if}
	</Field.Root>

	{#if showExtras}
		<Field.Root class="gap-1.5">
			<Field.Label for="{uid}-notes" class="text-xs">Notes</Field.Label>
			<Textarea id="{uid}-notes" rows={2} bind:value={notes} disabled={saving || busy} />
		</Field.Root>
	{/if}

	{#if saveError?.outcome === 'not-saved'}
		<Alert.Root variant="destructive">
			<Alert.Title>Training record was not saved</Alert.Title>
			<Alert.Description>{saveError.message}</Alert.Description>
		</Alert.Root>
	{:else if saveError}
		<Alert.Root variant="destructive">
			<Alert.Title>We couldn't confirm the save</Alert.Title>
			<Alert.Description>It may have saved. Saving again is safe and will not add a second record.</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="flex items-center justify-between gap-3">
		{#if showExtras}
			<span></span>
		{:else}
			<Button
				type="button"
				variant="link"
				size="none"
				class="text-sm text-foreground underline"
				onclick={() => (showExtras = true)}
			>
				Add a note…
			</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>
			{saving ? 'Saving...' : 'Save'}
			<CornerDownLeftIcon aria-hidden="true" />
		</Button>
	</div>
	{@render footer?.(saving)}
</form>
