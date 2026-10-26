<script lang="ts">
	import { onDestroy, tick, untrack, type Snippet } from 'svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CornerDownLeftIcon from '@lucide/svelte/icons/corner-down-left';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
	import { calculateExpirationDate } from '$features/training/utils/trainingStatus';
	import { renewalMode } from '$features/training/utils/cellDisplayText';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
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
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		/** Runs after a save that this form is still showing; `isUpdate` is true when it replaced a record. */
		onSaved?: (isUpdate: boolean) => void;
		/** Reports whether the date or an extra differs from what the form opened with; false once it goes. */
		onDirtyChange?: (dirty: boolean) => void;
		/** Context shown above the date field, ruled off from it. */
		header?: Snippet;
		/** Anything that belongs under Save. */
		footer?: Snippet;
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
	// An uploaded certificate is a storage path, not a link: it stays on the record unless a link replaces it.
	const storedCertificate = untrack(() => training?.certificateUrl ?? null);
	const editableCertificate = storedCertificate && /^https?:\/\//i.test(storedCertificate) ? storedCertificate : '';
	const storedNotes = untrack(() => training?.notes ?? '');
	let notes = $state(storedNotes);
	let certificateUrl = $state(editableCertificate);
	let showExtras = $state(Boolean(storedNotes || editableCertificate));
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let formElement = $state<HTMLFormElement | null>(null);

	$effect(() => {
		onDirtyChange?.(date !== initialDate || notes !== storedNotes || certificateUrl !== editableCertificate);
		return () => onDirtyChange?.(false);
	});

	const expirationDate = $derived(
		kind === 'cardDate' ? date || null : kind === 'months' ? calculateExpirationDate(date, type.expirationMonths) : null
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
				expirationDate,
				notes: notes.trim() || null,
				certificateUrl: certificateUrl.trim() || (editableCertificate ? null : storedCertificate)
			});
			if (!stillHere()) return;
			onSaved?.(isUpdate);
		} catch (error) {
			if (stillHere()) saveError = error instanceof Error && error.message.trim() ? error.message : 'Could not save.';
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

<form bind:this={formElement} class="grid gap-3" onsubmit={save} onkeydowncapture={submitOnEnterInDate}>
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
		<Field.Root class="gap-1.5">
			<Field.Label for="{uid}-certificate" class="text-xs">Certificate URL</Field.Label>
			<Input
				id="{uid}-certificate"
				type="url"
				placeholder="https://..."
				bind:value={certificateUrl}
				disabled={saving || busy}
			/>
		</Field.Root>
	{/if}

	{#if saveError}
		<Alert.Root variant="destructive">
			<Alert.Title>Training record was not saved</Alert.Title>
			<Alert.Description>{saveError}</Alert.Description>
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
				Add a note or certificate link…
			</Button>
		{/if}
		<Button type="submit" disabled={!canSave}>
			{saving ? 'Saving...' : 'Save'}
			<CornerDownLeftIcon aria-hidden="true" />
		</Button>
	</div>
	{@render footer?.()}
</form>
