<script lang="ts">
	import { untrack } from 'svelte';
	import { describeReadinessStanding, previewRenewal } from '$lib/domain/readinessItem';
	import {
		ReadinessHistory,
		ReadinessItemSheetHeader,
		type ReadinessHistoryEntry
	} from '$lib/components/patterns/readiness-items';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { ICT_VALIDATION_METHODS, type IctValidationMethod } from '../criticalTasks.types';
	import { correctCriticalTaskValidation, recordCriticalTaskValidation } from '../personnelCriticalTaskRequests';
	import { calculateIctExpirationDate } from '../utils/ictStatus';
	import type { PersonnelCriticalTaskItem } from '../utils/personnelCriticalTaskItems';

	let {
		orgId,
		personnelId,
		personName,
		items,
		taskId,
		asOf,
		canRecord,
		onSaved,
		onClose
	}: {
		orgId: string;
		personnelId: string;
		personName: string;
		/** Applicable tasks; the drawer opens one, or asks which when `taskId` is null. */
		items: PersonnelCriticalTaskItem[];
		taskId: string | null;
		asOf: string;
		canRecord: boolean;
		/** Refreshes the loads that show this Person's critical tasks. */
		onSaved: () => Promise<void>;
		onClose: () => void;
	} = $props();

	type Draft = { mode: 'record' } | { mode: 'correct'; id: string };

	let selectedTaskId = $state(untrack(() => taskId) ?? '');
	let draft = $state<Draft>({ mode: 'record' });
	let date = $state('');
	let method = $state<IctValidationMethod | ''>('');
	let validatedBy = $state('');
	let notes = $state('');
	let error = $state('');
	const saving = new PendingSave();

	const item = $derived(items.find((candidate) => candidate.taskId === selectedTaskId) ?? null);
	const preview = $derived(
		item && date && draft.mode === 'record'
			? previewRenewal(calculateIctExpirationDate(date, { expirationMonths: item.cycleMonths }), item.cycleMonths, asOf)
			: null
	);
	const historyEntries = $derived(
		(item?.history ?? []).map(
			(record): ReadinessHistoryEntry => ({
				id: record.id,
				label: `${formatDayMonthYear(record.completedAt)} → ${formatDayMonthYear(
					calculateIctExpirationDate(record.completedAt, { expirationMonths: item?.cycleMonths ?? null }) ??
						record.completedAt
				)}`,
				detail: [record.validationMethod, record.validatedBy && `by ${record.validatedBy}`, record.notes]
					.filter(Boolean)
					.join(' · '),
				href: null
			})
		)
	);
	const dirty = $derived(
		draft.mode === 'correct' || date !== asOf || method !== '' || validatedBy.trim() !== '' || notes.trim() !== ''
	);

	startRecord();

	function startRecord() {
		draft = { mode: 'record' };
		date = asOf;
		method = '';
		validatedBy = '';
		notes = '';
		error = '';
	}

	function startCorrection(id: string) {
		const record = item?.history.find((candidate) => candidate.id === id);
		if (!record) return;
		draft = { mode: 'correct', id };
		date = record.completedAt;
		method = record.validationMethod;
		validatedBy = record.validatedBy ?? '';
		notes = record.notes ?? '';
		error = '';
	}

	function chooseTask(next: string) {
		selectedTaskId = next;
		startRecord();
	}

	async function save() {
		if (!item) return;
		if (!date || !method) {
			error = !date ? 'Choose the validation date.' : 'Choose how the task was validated.';
			return;
		}
		error = '';
		const fields = {
			completedAt: date,
			validationMethod: method,
			validatedBy: validatedBy.trim() || null,
			notes: notes.trim() || null
		};
		try {
			if (draft.mode === 'record') {
				await recordCriticalTaskValidation(orgId, { personnelId, ictTaskId: item.taskId, ...fields });
			} else {
				await correctCriticalTaskValidation(orgId, draft.id, fields);
			}
		} catch (caught) {
			error = rejectedRequestMessage(caught, 'Unable to save this validation. Try again.');
			return;
		}
		await onSaved();
		if (draft.mode === 'record') {
			toastStore.success(`${item.name} validation saved`);
			onClose();
		} else {
			toastStore.success(`${item.name} correction saved`);
			startRecord();
		}
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet">
		<ReadinessItemSheetHeader
			eyebrow={`Critical task · ${personName}`}
			title={item?.name ?? 'Record a validation'}
			status={item?.status}
			standing={item ? `${item.taskCode} · ${describeReadinessStanding(item)}` : undefined}
		/>
		<AppDialog.Body class="flex flex-col gap-7 px-7 py-6">
			<fieldset class="contents" disabled={saving.pending}>
				{#if taskId === null}
					<Field.Root>
						<Field.Label for="critical-task-drawer-task">Task</Field.Label>
						<NativeSelect.Root
							id="critical-task-drawer-task"
							value={selectedTaskId}
							onchange={(event) => chooseTask(event.currentTarget.value)}
						>
							<NativeSelect.Option value="" disabled>Choose a task</NativeSelect.Option>
							{#each items as option (option.taskId)}
								<NativeSelect.Option value={option.taskId}>{option.taskCode} · {option.name}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Root>
				{/if}

				{#if item && canRecord}
					<form
						id="critical-task-drawer-form"
						class="flex flex-col gap-4"
						onsubmit={(event) => {
							event.preventDefault();
							void saving.run(save);
						}}
					>
						<h3 class="font-heading text-xl font-bold text-foreground">
							{draft.mode === 'record' ? 'Record a validation' : 'Correct this validation'}
						</h3>
						<Field.Root>
							<Field.Label for="critical-task-drawer-date">Validated on</Field.Label>
							<DatePicker id="critical-task-drawer-date" bind:value={date} />
						</Field.Root>
						{#if preview}
							<Alert.Root variant={preview.tone === 'current' ? 'success' : 'destructive'} role="status">
								<Alert.Description class="text-current">{preview.text}</Alert.Description>
							</Alert.Root>
						{/if}
						<Field.Root>
							<Field.Label for="critical-task-drawer-method">Validation method</Field.Label>
							<NativeSelect.Root id="critical-task-drawer-method" bind:value={method}>
								<NativeSelect.Option value="" disabled>Choose a method</NativeSelect.Option>
								{#each ICT_VALIDATION_METHODS as option (option)}
									<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</Field.Root>
						<Field.Root>
							<div class="flex justify-between">
								<Field.Label for="critical-task-drawer-validator">Validated by</Field.Label>
								<span class="text-[13px] text-muted-foreground">Optional</span>
							</div>
							<Input id="critical-task-drawer-validator" placeholder="e.g. SSG Alvarez" bind:value={validatedBy} />
						</Field.Root>
						<Field.Root>
							<div class="flex justify-between">
								<Field.Label for="critical-task-drawer-notes">Notes</Field.Label>
								<span class="text-[13px] text-muted-foreground">Optional</span>
							</div>
							<Textarea id="critical-task-drawer-notes" rows={3} bind:value={notes} />
						</Field.Root>
						{#if error}
							<Alert.Root variant="destructive" role="alert">
								<Alert.Description class="text-current">{error}</Alert.Description>
							</Alert.Root>
						{/if}
					</form>
				{/if}

				{#if item}
					<ReadinessHistory
						entries={historyEntries}
						editingId={draft.mode === 'correct' ? draft.id : null}
						onEdit={canRecord ? startCorrection : undefined}
					/>
				{/if}
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer class="border-t px-7 py-4">
			{#if draft.mode === 'correct'}
				<Button variant="outline" disabled={saving.pending} onclick={startRecord}>Cancel correction</Button>
			{:else}
				<Button variant="outline" disabled={saving.pending} onclick={onClose}>Cancel</Button>
			{/if}
			{#if item && canRecord}
				<Button type="submit" form="critical-task-drawer-form" disabled={saving.pending}>
					{draft.mode === 'record' ? 'Save validation' : 'Save correction'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
