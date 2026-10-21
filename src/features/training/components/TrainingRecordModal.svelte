<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import { toast } from 'svelte-sonner';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import TrainingStatusBadge from './TrainingStatusBadge.svelte';

	interface Props {
		person: Personnel;
		trainingType: TrainingType;
		existingTraining: PersonnelTraining | undefined;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		/** Offers Delete on an existing record when given. */
		onRemove?: (id: string, isCurrent?: () => boolean) => void | Promise<void>;
		onClose: () => void;
		canBeExempted?: boolean;
		isExempt?: boolean;
		onToggleExempt?: (exempt: boolean) => void;
	}

	let {
		person,
		trainingType,
		existingTraining,
		onSave,
		onRemove,
		onClose,
		canBeExempted = false,
		isExempt = false,
		onToggleExempt
	}: Props = $props();

	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed;

	const neverExpires = $derived(trainingType.expirationMonths === null && !trainingType.expirationDateOnly);
	const expirationDateOnly = $derived(trainingType.expirationDateOnly);
	const todayStr = formatDate(new Date());

	let isComplete = $state(false);
	let completionDate = $state('');
	let directExpirationDate = $state('');
	let notes = $state('');
	let certificateUrl = $state('');
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveButton = $state<HTMLElement | null>(null);
	let showRemoveConfirm = $state(false);

	const openingValues = $derived({
		isComplete: !!existingTraining,
		completionDate: existingTraining?.completionDate ?? (neverExpires ? '' : todayStr),
		directExpirationDate: existingTraining?.expirationDate ?? '',
		notes: existingTraining?.notes ?? '',
		certificateUrl: existingTraining?.certificateUrl ?? ''
	});
	const dirty = $derived(
		isComplete !== openingValues.isComplete ||
			completionDate !== openingValues.completionDate ||
			directExpirationDate !== openingValues.directExpirationDate ||
			notes !== openingValues.notes ||
			certificateUrl !== openingValues.certificateUrl
	);

	$effect(() => {
		isComplete = !!existingTraining;
		completionDate = existingTraining?.completionDate ?? (neverExpires ? '' : todayStr);
		directExpirationDate = existingTraining?.expirationDate ?? '';
		notes = existingTraining?.notes ?? '';
		certificateUrl = existingTraining?.certificateUrl ?? '';
	});

	const previewExpirationDate = $derived(
		expirationDateOnly
			? directExpirationDate || null
			: completionDate
				? calculateExpirationDate(completionDate, trainingType.expirationMonths)
				: null
	);

	const previewTraining = $derived({
		id: existingTraining?.id ?? '',
		personnelId: person.id,
		trainingTypeId: trainingType.id,
		completionDate: expirationDateOnly ? null : completionDate || null,
		expirationDate: previewExpirationDate,
		notes,
		certificateUrl
	} as PersonnelTraining);

	const previewStatus = $derived.by(() => {
		if (neverExpires && isComplete) {
			return getTrainingStatus(previewTraining, trainingType, person);
		}
		if (expirationDateOnly) {
			return getTrainingStatus(directExpirationDate ? previewTraining : undefined, trainingType, person);
		}
		if (!completionDate) {
			return getTrainingStatus(undefined, trainingType, person);
		}
		return getTrainingStatus(previewTraining, trainingType, person);
	});

	const canSave = $derived(expirationDateOnly ? !!directExpirationDate : neverExpires ? isComplete : !!completionDate);

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return 'Failed to save training record';
	}

	async function handleSave() {
		if (!canSave || isSaving || !isCurrent()) return;
		const saveData = {
			personnelId: person.id,
			trainingTypeId: trainingType.id,
			completionDate: expirationDateOnly ? null : completionDate || null,
			expirationDate: previewExpirationDate,
			notes: notes.trim() || null,
			certificateUrl: certificateUrl.trim() || null
		};
		const isUpdate = !!existingTraining;
		isSaving = true;
		saveError = null;
		try {
			await onSave(saveData);
			if (!isCurrent()) return;
			toast.success(isUpdate ? 'Training record updated' : 'Training record saved');
			onClose();
		} catch (error) {
			if (isCurrent()) saveError = getErrorMessage(error);
		} finally {
			if (isCurrent()) isSaving = false;
		}
		if (saveError && isCurrent()) {
			await tick();
			saveButton?.focus();
		}
	}

	async function doRemove() {
		if (existingTraining && onRemove && isCurrent()) {
			try {
				await onRemove(existingTraining.id, isCurrent);
				if (!isCurrent()) return;
				onClose();
			} catch (err) {
				if (!isCurrent()) return;
				toast.error(err instanceof Error ? err.message : 'Could not remove training record. Try again.', {
					duration: 6000
				});
			}
		}
	}
</script>

<AppDialog.Root busy={isSaving} closeBlocked={dirty} {onClose}>
	<AppDialog.Content showCloseButton={!isExempt}>
		<AppDialog.Header>
			<AppDialog.Title>{existingTraining ? 'Edit' : 'Add'} Training Record</AppDialog.Title>
			<AppDialog.Description>
				{person.rank}
				{person.lastName}, {person.firstName}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			{#if saveError}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Title>Training record was not saved</Alert.Title>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}
			<fieldset class="grid min-w-0 gap-4" disabled={isSaving}>
				<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="outline">
							<span class="size-2 rounded-sm" style:background-color={trainingType.color} aria-hidden="true"></span>
							{trainingType.name}
						</Badge>
						{#if neverExpires}
							<Badge variant="outline">Never Expires</Badge>
						{:else if expirationDateOnly}
							<Badge variant="outline">Expiration date per person</Badge>
						{/if}
					</div>
					{#if trainingType.description}
						<p class="text-sm leading-relaxed text-muted-foreground">{trainingType.description}</p>
					{/if}
				</section>

				{#if canBeExempted && onToggleExempt}
					<div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
						<Button
							variant={isExempt ? 'destructive' : 'outline'}
							size="sm"
							type="button"
							onclick={() => onToggleExempt?.(!isExempt)}
						>
							{isExempt ? 'Remove Exemption' : 'Mark as Exempt'}
						</Button>
						{#if isExempt}
							<Badge variant="outline">Exempt</Badge>
						{/if}
					</div>
				{/if}

				{#if isExempt}
					<Alert.Root variant="info">
						<Alert.Description>This person is exempt from this training requirement.</Alert.Description>
					</Alert.Root>
				{:else if expirationDateOnly}
					<Field.Root>
						<Field.Label for="expiration-date">License / Certification Expiration Date</Field.Label>
						<DatePicker id="expiration-date" bind:value={directExpirationDate} />
						<Field.Description>Enter the expiration date shown on the license or certificate.</Field.Description>
					</Field.Root>
				{:else if neverExpires}
					<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-muted/30 p-3">
						<Checkbox id="mark-complete" bind:checked={isComplete} />
						<Field.Label for="mark-complete">Mark as Complete</Field.Label>
					</Field.Root>

					<Field.Root>
						<Field.Label for="completion-date">Completion Date (Optional)</Field.Label>
						<DatePicker id="completion-date" disabled={!isComplete} bind:value={completionDate} />
						<Field.Description>Record when training was completed for your records.</Field.Description>
					</Field.Root>
				{:else}
					<Field.Root>
						<Field.Label for="completion-date">Completion Date</Field.Label>
						<DatePicker id="completion-date" bind:value={completionDate} />
					</Field.Root>
				{/if}

				{#if !isExempt}
					<section class="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Expiration
							</span>
							<span class="text-sm font-semibold text-foreground">
								{#if neverExpires}
									Never expires
								{:else}
									{previewExpirationDate ?? (expirationDateOnly ? 'Enter expiration date' : 'Set completion date')}
								{/if}
							</span>
						</div>
						<div class="grid gap-1">
							<span class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Status
							</span>
							<TrainingStatusBadge status={previewStatus.status} />
						</div>
					</section>

					<Field.Root>
						<Field.Label for="notes">Notes (optional)</Field.Label>
						<Textarea id="notes" placeholder="Any additional notes..." rows={2} bind:value={notes} />
					</Field.Root>

					<Field.Root>
						<Field.Label for="certificate-url">Certificate URL (optional)</Field.Label>
						<Input id="certificate-url" type="url" placeholder="https://..." bind:value={certificateUrl} />
					</Field.Root>
				{/if}
			</fieldset>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if !isExempt && existingTraining && onRemove}
				<Button variant="destructive" type="button" onclick={() => (showRemoveConfirm = true)} disabled={isSaving}>
					Delete
				</Button>
			{/if}
			<div class="flex-1"></div>
			<Button variant="outline" type="button" onclick={onClose} disabled={isSaving}>
				{isExempt ? 'Close' : 'Cancel'}
			</Button>
			{#if !isExempt}
				<Button
					type="button"
					data-testid="training-save"
					bind:ref={saveButton}
					onclick={handleSave}
					disabled={!canSave || isSaving}
				>
					{isSaving ? 'Saving...' : 'Save'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showRemoveConfirm}
	<ConfirmDialog
		title="Delete Training Record"
		message="Are you sure you want to delete this training record?"
		confirmLabel="Delete"
		onConfirm={doRemove}
		onCancel={() => (showRemoveConfirm = false)}
	/>
{/if}
