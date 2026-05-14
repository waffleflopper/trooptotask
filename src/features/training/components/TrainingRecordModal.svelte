<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { TrainingStatusBadge } from '$lib/components/ui/requirement-status-badge';

	interface Props {
		person: Personnel;
		trainingType: TrainingType;
		existingTraining: PersonnelTraining | undefined;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		onRemove: (id: string) => void | Promise<void>;
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

	const neverExpires = $derived(trainingType.expirationMonths === null && !trainingType.expirationDateOnly);
	const expirationDateOnly = $derived(trainingType.expirationDateOnly);
	const todayStr = formatDate(new Date());

	let isComplete = $state(false);
	let completionDate = $state('');
	let directExpirationDate = $state('');
	let notes = $state('');
	let certificateUrl = $state('');
	let isSaving = $state(false);
	let showRemoveConfirm = $state(false);

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
		if (!canSave || isSaving) return;
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
		try {
			await onSave(saveData);
			toastStore.success(isUpdate ? 'Training record updated' : 'Training record saved');
			onClose();
		} catch (error) {
			toastStore.error(getErrorMessage(error));
		} finally {
			isSaving = false;
		}
	}

	async function doRemove() {
		if (existingTraining) {
			try {
				await onRemove(existingTraining.id);
			} catch (err) {
				console.error('Training record removal failed:', err);
			}
			onClose();
		}
	}
</script>

<AppDialog.Root closeBlocked={isSaving} {onClose}>
	<AppDialog.Content closeBlocked={isSaving}>
		<AppDialog.Header>
			<AppDialog.Title>{existingTraining ? 'Edit' : 'Add'} Training Record</AppDialog.Title>
			<AppDialog.Description>
				{person.rank}
				{person.lastName}, {person.firstName}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<div class="grid gap-4">
				<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
					<div class="flex flex-wrap items-center gap-2">
						<Badge style={`background-color: ${trainingType.color}`}>{trainingType.name}</Badge>
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
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if !isExempt && existingTraining}
				<Button variant="destructive" type="button" onclick={() => (showRemoveConfirm = true)}>Delete</Button>
			{/if}
			<div class="flex-1"></div>
			<Button variant="outline" type="button" onclick={onClose} disabled={isSaving}>
				{isExempt ? 'Close' : 'Cancel'}
			</Button>
			{#if !isExempt}
				<Button type="button" data-testid="training-save" onclick={handleSave} disabled={!canSave || isSaving}>
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
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (showRemoveConfirm = false)}
	/>
{/if}
