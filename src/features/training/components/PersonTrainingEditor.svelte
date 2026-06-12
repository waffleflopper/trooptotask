<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { TrainingStatusBadge } from '$lib/components/ui/requirement-status-badge';

	interface TrainingEditState {
		isComplete: boolean;
		completionDate: string;
		directExpirationDate: string;
		notes: string;
		certificateUrl: string;
		isEditing: boolean;
		isDirty: boolean;
	}

	type TrainingBatchCompletionRecord = {
		personnelId: string;
		trainingTypeId: string;
		completionDate: string | null;
		notes?: string;
		status: 'completed';
	};

	interface Props {
		person: Personnel;
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onSaveBatch?: (records: TrainingBatchCompletionRecord[]) => Promise<void>;
		onRemove: (id: string) => Promise<void>;
		onClose: () => void;
		onToggleExempt?: (typeId: string, exempt: boolean) => void;
	}

	let { person, trainingTypes, trainings, onSave, onSaveBatch, onRemove, onClose, onToggleExempt }: Props = $props();

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

	$effect(() => {
		editingStates.clear();

		for (const type of trainingTypes) {
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
	});

	function getStatusInfo(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		const training = trainingMap.get(typeId);
		if (!type) return { status: 'not-required' as const, label: 'N/A', color: '#6b7280' };
		return getTrainingStatus(training, type, person);
	}

	const stats = $derived.by(() => {
		let current = 0,
			warningYellow = 0,
			warningOrange = 0,
			expired = 0,
			notCompleted = 0;

		for (const type of trainingTypes) {
			const status = getStatusInfo(type.id);
			switch (status.label) {
				case 'Current':
					current++;
					break;
				case 'Under 60d':
					warningYellow++;
					break;
				case 'Under 30d':
					warningOrange++;
					break;
				case 'Expired':
					expired++;
					break;
				case 'Not Done':
					notCompleted++;
					break;
				case 'N/A':
					break;
				default:
					current++;
					break;
			}
		}

		return { current, warningYellow, warningOrange, expired, notCompleted };
	});

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

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate: today,
			expirationDate,
			notes: null,
			certificateUrl: null
		});

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

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		});

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

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate,
			expirationDate,
			notes: state.notes.trim() || null,
			certificateUrl: state.certificateUrl.trim() || null
		});

		editingStates.set(typeId, { ...state, isComplete: true, isEditing: false, isDirty: false });
	}

	let confirmRemoveTypeId = $state<string | null>(null);
	let showMarkAllConfirm = $state(false);

	function removeTraining(typeId: string) {
		confirmRemoveTypeId = typeId;
	}

	async function doRemoveTraining() {
		const typeId = confirmRemoveTypeId;
		if (!typeId) return;
		confirmRemoveTypeId = null;

		const existing = trainingMap.get(typeId);
		if (!existing) return;

		const type = trainingTypes.find((t) => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;

		await onRemove(existing.id);

		editingStates.set(typeId, {
			isComplete: false,
			completionDate: neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date()),
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	async function markAllCompletedToday() {
		showMarkAllConfirm = true;
	}

	async function doMarkAllCompleted() {
		showMarkAllConfirm = false;
		const applicableTypes = trainingTypes.filter((t) => !t.expirationDateOnly);
		const today = formatDate(new Date());
		const records = applicableTypes.map((type) => ({
			personnelId: person.id,
			trainingTypeId: type.id,
			completionDate: today,
			notes: undefined,
			status: 'completed' as const
		}));

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

<AppDialog.Root {onClose}>
	<AppDialog.Content size="wide">
		<AppDialog.Header>
			<AppDialog.Title>Training Records</AppDialog.Title>
			<AppDialog.Description>{person.rank} {person.lastName}, {person.firstName}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<div class="grid gap-4">
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
					{#each [['Current', stats.current, 'success'], ['<60d', stats.warningYellow, 'warning'], ['<30d', stats.warningOrange, 'warning'], ['Expired', stats.expired, 'destructive'], ['Not Done', stats.notCompleted, 'outline']] as item (item[0])}
						<div class="rounded-lg border border-border bg-card p-3 text-center">
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
												<Button size="sm" type="button" onclick={() => markComplete(type.id)}>Complete</Button>
											{:else}
												<Button size="sm" type="button" onclick={() => markCompletedToday(type.id)}>Today</Button>
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
											onclick={() => saveTraining(type.id)}
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
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose}>Close</Button>
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
		onConfirm={doMarkAllCompleted}
		onCancel={() => (showMarkAllConfirm = false)}
	/>
{/if}
