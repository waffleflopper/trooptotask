<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { DEFAULT_TRAINING_TYPE_COLOR, type TrainingBatchRecord } from '../contracts';
	import type { Personnel } from '$features/personnel/contracts';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import {
		calculateExpirationDate,
		getTrainingStatus,
		getTrainingStats
	} from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
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
	import TrainingStatusBadge from './TrainingStatusBadge.svelte';

	interface TrainingEditState {
		isComplete: boolean;
		completionDate: string;
		directExpirationDate: string;
		notes: string;
		certificateUrl: string;
		isEditing: boolean;
		isDirty: boolean;
	}

	type TrainingBatchCompletionRecord = TrainingBatchRecord & { status: 'completed' };

	interface Props {
		person: Personnel;
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onSaveBatch?: (records: TrainingBatchCompletionRecord[]) => Promise<void>;
		onRemove: (id: string, isCurrent?: () => boolean) => Promise<void>;
		onClose: () => void;
		onToggleExempt?: (typeId: string, exempt: boolean) => void;
	}

	let { person, trainingTypes, trainings, onSave, onSaveBatch, onRemove, onClose, onToggleExempt }: Props = $props();

	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed;
	const saving = new PendingSave();

	const trainingMap = $derived.by(() => {
		const map = new SvelteMap<string, PersonnelTraining>();
		for (const t of trainings) {
			if (t.personnelId === person.id) {
				map.set(t.trainingTypeId, t);
			}
		}
		return map;
	});

	const editingStates = new SvelteMap<string, TrainingEditState>();
	let editingPersonId: string | undefined;
	let saveError = $state<string | null>(null);
	const dirty = $derived([...editingStates.values()].some((state) => state.isEditing && state.isDirty));

	$effect(() => {
		const drafts = untrack(() => new Map(editingStates));
		const retainDrafts = editingPersonId === person.id;
		if (!retainDrafts) saveError = null;
		editingStates.clear();

		for (const type of trainingTypes) {
			const draft = retainDrafts ? drafts.get(type.id) : undefined;
			if (draft?.isEditing) {
				editingStates.set(type.id, draft);
				continue;
			}
			const existing = trainingMap.get(type.id);
			const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;
			editingStates.set(type.id, {
				isComplete: !!existing,
				completionDate:
					existing?.completionDate ?? (neverExpires || type.expirationDateOnly ? '' : formatDate(new Date())),
				directExpirationDate: existing?.expirationDate ?? '',
				notes: existing?.notes ?? '',
				certificateUrl: existing?.certificateUrl ?? '',
				isEditing: false,
				isDirty: false
			});
		}
		editingPersonId = person.id;
	});

	async function persistTraining(
		operation: () => Promise<void>,
		reportFailure: (message: string) => void
	): Promise<boolean> {
		const personnelId = person.id;
		if (!isCurrent()) return false;
		try {
			await operation();
			return isCurrent() && person.id === personnelId;
		} catch (error) {
			if (isCurrent() && person.id === personnelId) {
				reportFailure(error instanceof Error ? error.message : 'Could not save training record. Try again.');
			}
			return false;
		}
	}

	function getStatusInfo(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		const training = trainingMap.get(typeId);
		if (!type) return { status: 'not-required' as const, label: 'N/A', color: DEFAULT_TRAINING_TYPE_COLOR };
		return getTrainingStatus(training, type, person);
	}

	const stats = $derived(getTrainingStats([person], trainingTypes, trainings));

	function reportSaveFailure(typeId: string, message: string) {
		const typeName = trainingTypes.find((type) => type.id === typeId)?.name;
		saveError = typeName ? `${typeName}: ${message}` : message;
	}

	function runSave(event: MouseEvent, save: () => Promise<void>) {
		const trigger = event.currentTarget as HTMLElement;
		saveError = null;
		void saving.run(save).then(async () => {
			if (!saveError || !isCurrent()) return;
			await tick();
			if (trigger.isConnected) trigger.focus();
		});
	}

	function toggleEdit(typeId: string) {
		const state = editingStates.get(typeId);
		if (state) {
			editingStates.set(typeId, { ...state, isEditing: !state.isEditing });
		}
	}

	function updateField(
		typeId: string,
		field: 'completionDate' | 'directExpirationDate' | 'notes' | 'certificateUrl' | 'isComplete',
		value: string | boolean
	) {
		const state = editingStates.get(typeId);
		if (state) {
			editingStates.set(typeId, { ...state, [field]: value, isDirty: true });
		}
	}

	async function markCompletedToday(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!type) return;

		const today = formatDate(new Date());
		const expirationDate = calculateExpirationDate(today, type.expirationMonths);

		const saved = await persistTraining(
			() =>
				onSave({
					personnelId: person.id,
					trainingTypeId: typeId,
					completionDate: today,
					expirationDate,
					notes: null,
					certificateUrl: null
				}),
			(message) => reportSaveFailure(typeId, message)
		);
		if (!saved) return;

		editingStates.set(typeId, {
			isComplete: true,
			completionDate: today,
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	async function markComplete(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!type || type.expirationMonths !== null) return;

		const saved = await persistTraining(
			() =>
				onSave({
					personnelId: person.id,
					trainingTypeId: typeId,
					completionDate: null,
					expirationDate: null,
					notes: null,
					certificateUrl: null
				}),
			(message) => reportSaveFailure(typeId, message)
		);
		if (!saved) return;

		editingStates.set(typeId, {
			isComplete: true,
			completionDate: '',
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	async function saveTraining(typeId: string) {
		const state = editingStates.get(typeId);
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!state || !type) return;

		const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;

		if (type.expirationDateOnly) {
			if (!state.directExpirationDate) return;
		} else if (!neverExpires && !state.completionDate) {
			return;
		}

		const completionDate = type.expirationDateOnly ? null : state.completionDate || null;
		const expirationDate = type.expirationDateOnly
			? state.directExpirationDate || null
			: calculateExpirationDate(completionDate, type.expirationMonths);

		const saved = await persistTraining(
			() =>
				onSave({
					personnelId: person.id,
					trainingTypeId: typeId,
					completionDate,
					expirationDate,
					notes: state.notes.trim() || null,
					certificateUrl: state.certificateUrl.trim() || null
				}),
			(message) => reportSaveFailure(typeId, message)
		);
		if (!saved) return;

		editingStates.set(typeId, { ...state, isComplete: true, isEditing: false, isDirty: false });
	}

	let confirmRemoveTypeId = $state<string | null>(null);
	let showMarkAllConfirm = $state(false);

	function removeTraining(typeId: string) {
		confirmRemoveTypeId = typeId;
	}

	async function doRemoveTraining() {
		const typeId = confirmRemoveTypeId;
		if (!typeId || !isCurrent()) return;

		const existing = trainingMap.get(typeId);
		if (!existing) {
			confirmRemoveTypeId = null;
			return;
		}

		try {
			await onRemove(existing.id, isCurrent);
			if (!isCurrent()) return;
		} catch (error) {
			if (!isCurrent()) return;
			toast.error(error instanceof Error ? error.message : 'Could not remove training record. Try again.', {
				duration: 6000
			});
			return;
		}
		confirmRemoveTypeId = null;
	}

	async function markAllCompletedToday() {
		showMarkAllConfirm = true;
	}

	async function doMarkAllCompleted() {
		const applicableTypes = trainingTypes.filter((t) => !t.expirationDateOnly);
		const today = formatDate(new Date());
		const records = applicableTypes.map((type) => ({
			personnelId: person.id,
			trainingTypeId: type.id,
			completionDate: today,
			notes: undefined,
			status: 'completed' as const
		}));

		const saved = await persistTraining(
			async () => {
				if (onSaveBatch) {
					await onSaveBatch(records);
				} else {
					for (const type of applicableTypes) {
						const expirationDate = calculateExpirationDate(today, type.expirationMonths);
						await onSave({
							personnelId: person.id,
							trainingTypeId: type.id,
							completionDate: today,
							expirationDate,
							notes: null,
							certificateUrl: null
						});
					}
				}
			},
			(message) => toast.error(message, { duration: 6000 })
		);
		if (!saved) return;

		showMarkAllConfirm = false;
		for (const type of applicableTypes) {
			editingStates.set(type.id, {
				isComplete: true,
				completionDate: today,
				directExpirationDate: '',
				notes: '',
				certificateUrl: '',
				isEditing: false,
				isDirty: false
			});
		}
	}

	function cancelEdit(typeId: string) {
		const existing = trainingMap.get(typeId);
		const type = trainingTypes.find((t) => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;
		editingStates.set(typeId, {
			isComplete: !!existing,
			completionDate:
				existing?.completionDate ?? (neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date())),
			directExpirationDate: existing?.expirationDate ?? '',
			notes: existing?.notes ?? '',
			certificateUrl: existing?.certificateUrl ?? '',
			isEditing: false,
			isDirty: false
		});
	}
</script>

<AppDialog.Root {onClose} busy={saving.pending} closeBlocked={dirty}>
	<AppDialog.Content size="wide" showCloseButton={false}>
		<AppDialog.Header>
			<AppDialog.Title>Training Records</AppDialog.Title>
			<AppDialog.Description>{person.rank} {person.lastName}, {person.firstName}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			{#if saveError}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Title>Training record was not saved</Alert.Title>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}
			<fieldset class="grid min-w-0 gap-4" disabled={saving.pending}>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{#each [['Current', stats.current, 'success'], ['<60d', stats.warningYellow, 'warning'], ['<30d', stats.warningOrange, 'warning'], ['Expired', stats.expired, 'destructive'], ['Not Done', stats.notCompleted, 'outline']] as item (item[0])}
						<div
							role="group"
							aria-label={String(item[0])}
							class="rounded-lg border border-border bg-card p-3 text-center"
						>
							<div class="text-xl font-semibold text-foreground">{item[1]}</div>
							<Badge variant={item[2] as 'success' | 'warning' | 'destructive' | 'outline'}>{item[0]}</Badge>
						</div>
					{/each}
				</div>

				<div class="flex justify-end">
					<Button type="button" size="sm" onclick={markAllCompletedToday}>Mark All Completed Today</Button>
				</div>

				<div class="grid gap-3">
					{#each trainingTypes as type (type.id)}
						{@const existing = trainingMap.get(type.id)}
						{@const status = getStatusInfo(type.id)}
						{@const state = editingStates.get(type.id)}
						{@const isExempt = type.canBeExempted && type.exemptPersonnelIds.includes(person.id)}
						<section class="rounded-lg border border-border bg-card">
							<div
								class="flex flex-col gap-3 border-b border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="flex min-w-0 flex-wrap items-center gap-2">
									<Badge style={`background-color: ${type.color}`}>{type.name}</Badge>
									<TrainingStatusBadge status={status.status} />
								</div>
								{#if !state?.isEditing}
									<div class="flex flex-wrap justify-end gap-2">
										{#if type.canBeExempted && onToggleExempt}
											<Button
												variant={isExempt ? 'destructive' : 'outline'}
												size="sm"
												type="button"
												onclick={() => onToggleExempt?.(type.id, !isExempt)}
											>
												{isExempt ? 'Unexempt' : 'Exempt'}
											</Button>
										{/if}
										{#if !isExempt}
											{@const neverExpires = type.expirationMonths === null && !type.expirationDateOnly}
											{#if type.expirationDateOnly}
												<!-- Expiration-date-only training must be edited manually. -->
											{:else if neverExpires && !existing}
												<Button
													size="sm"
													type="button"
													onclick={(event) => runSave(event, () => markComplete(type.id))}
												>
													Complete
												</Button>
											{:else}
												<Button
													size="sm"
													type="button"
													onclick={(event) => runSave(event, () => markCompletedToday(type.id))}
												>
													Today
												</Button>
											{/if}
											<Button variant="outline" size="sm" type="button" onclick={() => toggleEdit(type.id)}>
												{existing ? 'Edit' : 'Add'}
											</Button>
											{#if existing}
												<Button
													variant="destructive"
													size="sm"
													type="button"
													aria-label={`Remove ${type.name} record`}
													onclick={() => removeTraining(type.id)}
												>
													Delete
												</Button>
											{/if}
										{/if}
									</div>
								{/if}
							</div>

							{#if existing && !state?.isEditing}
								<div class="flex flex-wrap gap-4 p-3 text-sm">
									{#if existing.completionDate}
										<span><span class="text-muted-foreground">Completed:</span> {existing.completionDate}</span>
									{:else}
										<span><span class="text-muted-foreground">Status:</span> Complete (no date)</span>
									{/if}
									{#if existing.expirationDate}
										<span><span class="text-muted-foreground">Expires:</span> {existing.expirationDate}</span>
									{/if}
									{#if existing.notes}
										<span class="w-full"><span class="text-muted-foreground">Notes:</span> {existing.notes}</span>
									{/if}
								</div>
							{/if}

							{#if state?.isEditing}
								{@const neverExpires = type.expirationMonths === null && !type.expirationDateOnly}
								<div class="grid gap-3 p-4">
									{#if type.expirationDateOnly}
										<Field.Root>
											<Field.Label for="date-{type.id}">Expiration Date</Field.Label>
											<DatePicker
												id="date-{type.id}"
												value={state.directExpirationDate}
												onValueChange={(value) => updateField(type.id, 'directExpirationDate', value)}
											/>
											<Field.Description>
												Status: {state.directExpirationDate
													? state.directExpirationDate >= formatDate(new Date())
														? 'Current'
														: 'Expired'
													: 'Set date'}
											</Field.Description>
										</Field.Root>
									{:else if neverExpires}
										<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-muted/30 p-3">
											<Checkbox
												id="complete-{type.id}"
												checked={state.isComplete}
												onCheckedChange={(checked) => updateField(type.id, 'isComplete', checked)}
											/>
											<Field.Label for="complete-{type.id}">Mark as Complete</Field.Label>
										</Field.Root>
										<Field.Root>
											<Field.Label for="date-{type.id}">Completion Date (Optional)</Field.Label>
											<DatePicker
												id="date-{type.id}"
												value={state.completionDate}
												disabled={!state.isComplete}
												onValueChange={(value) => updateField(type.id, 'completionDate', value)}
											/>
											<Field.Description>Expires: Never</Field.Description>
										</Field.Root>
									{:else}
										<Field.Root>
											<Field.Label for="date-{type.id}">Completion Date</Field.Label>
											<DatePicker
												id="date-{type.id}"
												value={state.completionDate}
												onValueChange={(value) => updateField(type.id, 'completionDate', value)}
											/>
											<Field.Description>
												Expires: {calculateExpirationDate(state.completionDate, type.expirationMonths) ?? 'Set date'}
											</Field.Description>
										</Field.Root>
									{/if}

									<Field.Root>
										<Field.Label for="notes-{type.id}">Notes</Field.Label>
										<Input
											id="notes-{type.id}"
											value={state.notes}
											oninput={(e) => updateField(type.id, 'notes', e.currentTarget.value)}
											placeholder="Optional notes..."
										/>
									</Field.Root>
									<Field.Root>
										<Field.Label for="cert-{type.id}">Certificate URL</Field.Label>
										<Input
											id="cert-{type.id}"
											type="url"
											value={state.certificateUrl}
											oninput={(e) => updateField(type.id, 'certificateUrl', e.currentTarget.value)}
											placeholder="https://..."
										/>
									</Field.Root>
									<div class="flex justify-end gap-2">
										<Button variant="outline" size="sm" type="button" onclick={() => cancelEdit(type.id)}>Cancel</Button
										>
										<Button
											size="sm"
											type="button"
											onclick={(event) => runSave(event, () => saveTraining(type.id))}
											disabled={type.expirationDateOnly
												? !state.directExpirationDate
												: neverExpires
													? !state.isComplete
													: !state.completionDate}
										>
											Save
										</Button>
									</div>
								</div>
							{/if}
						</section>
					{/each}
				</div>
			</fieldset>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose} disabled={saving.pending}>Close</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmRemoveTypeId}
	<ConfirmDialog
		title="Remove Training Record"
		message="Are you sure you want to remove this training record?"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doRemoveTraining}
		onCancel={() => (confirmRemoveTypeId = null)}
	/>
{/if}

{#if showMarkAllConfirm}
	{@const count = trainingTypes.filter((t) => !t.expirationDateOnly).length}
	<ConfirmDialog
		title="Mark All Completed"
		message="Mark {count} trainings as completed today? (Expiration-date-only trainings must be set individually)"
		confirmLabel="Mark All"
		variant="warning"
		onConfirm={() => saving.run(doMarkAllCompleted)}
		onCancel={() => (showMarkAllConfirm = false)}
	/>
{/if}
