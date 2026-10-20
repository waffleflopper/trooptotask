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
	import { PDF_OR_PHOTO_ACCEPT, declaredPdfOrPhotoType, withDeclaredType } from '$lib/storage/pdfOrPhotoFiles';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import {
		correctTrainingCompletion,
		logTrainingCompletion,
		setTrainingExemption,
		trainingCertificateLink
	} from '../personnelTrainingRequests';
	import type { PersonnelTraining, TrainingCompletionHistoryEntry } from '../training.types';
	import type { PersonnelTrainingItem } from '../utils/personnelTrainingItems';
	import { calculateExpirationDate } from '../utils/trainingStatus';

	let {
		orgId,
		personnelId,
		personName,
		items,
		typeId,
		asOf,
		canRecord,
		canExempt,
		onSaved,
		onClose
	}: {
		orgId: string;
		personnelId: string;
		personName: string;
		/** Required items; the drawer opens one, or asks which when `typeId` is null. */
		items: PersonnelTrainingItem[];
		typeId: string | null;
		asOf: string;
		canRecord: boolean;
		canExempt: boolean;
		/** Refreshes the loads that show this Person's training. */
		onSaved: () => Promise<void>;
		onClose: () => void;
	} = $props();

	type Draft = { mode: 'log' } | { mode: 'correct'; kind: 'current' | 'history'; id: string };
	type Recorded =
		| { kind: 'current'; record: PersonnelTraining }
		| { kind: 'history'; record: TrainingCompletionHistoryEntry };

	let selectedTypeId = $state(untrack(() => typeId) ?? '');
	let draft = $state<Draft>({ mode: 'log' });
	let date = $state('');
	let notes = $state('');
	let certificate = $state<File | null>(null);
	let certificateInput = $state<HTMLInputElement | null>(null);
	let error = $state('');
	const saving = new PendingSave();

	const item = $derived(items.find((candidate) => candidate.typeId === selectedTypeId) ?? null);
	const datesExpiration = $derived(item?.expirationDateOnly ?? false);
	const expirationDate = $derived(
		datesExpiration ? date || null : calculateExpirationDate(date || null, item?.cycleMonths ?? null)
	);
	const preview = $derived(
		item && date && draft.mode === 'log' ? previewRenewal(expirationDate, item.cycleMonths, asOf) : null
	);
	const recorded = $derived<Recorded[]>(
		item
			? [
					...(item.completion ? [{ kind: 'current' as const, record: item.completion }] : []),
					...item.history.map((record) => ({ kind: 'history' as const, record }))
				]
			: []
	);
	const historyEntries = $derived(
		recorded.map(
			({ kind, record }): ReadinessHistoryEntry => ({
				id: `${kind}:${record.id}`,
				label: datesExpiration
					? `Expires ${record.expirationDate ? formatDayMonthYear(record.expirationDate) : '—'}`
					: `${record.completionDate ? formatDayMonthYear(record.completionDate) : '—'} → ${
							record.expirationDate ? formatDayMonthYear(record.expirationDate) : 'does not expire'
						}`,
				detail: record.notes,
				certificate: trainingCertificateLink(orgId, kind, record.id, record.certificateUrl)
			})
		)
	);
	const dirty = $derived(draft.mode === 'correct' || date !== initialDate() || notes.trim() !== '' || !!certificate);

	startLog();

	function initialDate(): string {
		return datesExpiration ? '' : asOf;
	}

	function startLog() {
		draft = { mode: 'log' };
		date = initialDate();
		notes = '';
		certificate = null;
		if (certificateInput) certificateInput.value = '';
		error = '';
	}

	function startCorrection(entryId: string) {
		const entry = recorded.find(({ kind, record }) => `${kind}:${record.id}` === entryId);
		if (!entry) return;
		draft = { mode: 'correct', kind: entry.kind, id: entry.record.id };
		date = (datesExpiration ? entry.record.expirationDate : entry.record.completionDate) ?? '';
		notes = entry.record.notes ?? '';
		error = '';
	}

	function chooseType(next: string) {
		selectedTypeId = next;
		startLog();
	}

	async function save() {
		if (!item) return;
		if (!date) {
			error = datesExpiration ? 'Choose the expiration date.' : 'Choose the completion date.';
			return;
		}
		error = '';
		const trimmedNotes = notes.trim() || null;
		try {
			if (draft.mode === 'log') {
				await logTrainingCompletion(orgId, {
					personnelId,
					trainingTypeId: item.typeId,
					completionDate: datesExpiration ? null : date,
					expirationDate: datesExpiration ? date : null,
					notes: trimmedNotes,
					certificate
				});
			} else {
				await correctTrainingCompletion(orgId, {
					kind: draft.kind,
					id: draft.id,
					...(datesExpiration ? { expirationDate: date } : { completionDate: date }),
					notes: trimmedNotes
				});
			}
		} catch (caught) {
			error = rejectedRequestMessage(caught, 'Unable to save this completion. Try again.');
			return;
		}
		await onSaved();
		if (draft.mode === 'log') {
			toastStore.success(`${item.name} completion saved`);
			onClose();
		} else {
			toastStore.success(`${item.name} correction saved`);
			startLog();
		}
	}

	async function exempt(target: PersonnelTrainingItem, value: boolean) {
		await setTrainingExemption(orgId, target.typeId, personnelId, value);
		await onSaved();
	}

	async function markExempt() {
		if (!item) return;
		const target = item;
		try {
			await exempt(target, true);
		} catch (caught) {
			error = rejectedRequestMessage(caught, 'Unable to mark this exempt. Try again.');
			return;
		}
		toastStore.success(`${personName} is exempt from ${target.name}`, 10_000, {
			label: 'Undo',
			onClick: () =>
				void exempt(target, false).catch((caught) =>
					toastStore.error(rejectedRequestMessage(caught, `Unable to undo the ${target.name} exemption.`))
				)
		});
		onClose();
	}

	function pickCertificate(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		const type = file && declaredPdfOrPhotoType(file);
		certificate = file && type ? withDeclaredType(file, type) : file;
	}
</script>

<AppDialog.Root open busy={saving.pending} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet">
		<ReadinessItemSheetHeader
			eyebrow={`Training · ${personName}`}
			title={item?.name ?? 'Log a completion'}
			status={item?.status}
			standing={item
				? describeReadinessStanding({
						status: item.status,
						expirationDate: item.completion?.expirationDate ?? null,
						daysUntilExpiration: item.daysUntilExpiration
					})
				: undefined}
		/>
		<AppDialog.Body class="flex flex-col gap-7 px-7 py-6">
			<fieldset class="contents" disabled={saving.pending}>
				{#if typeId === null}
					<Field.Root>
						<Field.Label for="training-drawer-type">Training type</Field.Label>
						<NativeSelect.Root
							id="training-drawer-type"
							value={selectedTypeId}
							onchange={(event) => chooseType(event.currentTarget.value)}
						>
							<NativeSelect.Option value="" disabled>Choose a training type</NativeSelect.Option>
							{#each items as option (option.typeId)}
								<NativeSelect.Option value={option.typeId}>{option.name}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Root>
				{/if}

				{#if item && canRecord}
					<form
						class="flex flex-col gap-4"
						onsubmit={(event) => {
							event.preventDefault();
							void saving.run(save);
						}}
						id="training-drawer-form"
					>
						<h3 class="font-heading text-xl font-bold text-foreground">
							{#if draft.mode === 'log'}
								Log a new completion
							{:else}
								Correct this completion
							{/if}
						</h3>
						<Field.Root>
							<Field.Label for="training-drawer-date">{datesExpiration ? 'Expires on' : 'Completed on'}</Field.Label>
							<DatePicker id="training-drawer-date" bind:value={date} />
						</Field.Root>
						{#if preview}
							<Alert.Root variant={preview.tone === 'current' ? 'success' : 'destructive'} role="status">
								<Alert.Description class="text-current">{preview.text}</Alert.Description>
							</Alert.Root>
						{/if}
						{#if draft.mode === 'log'}
							<Field.Root>
								<div class="flex justify-between">
									<Field.Label for="training-drawer-certificate">Certificate</Field.Label>
									<span class="text-[13px] text-muted-foreground">Optional</span>
								</div>
								<Input
									id="training-drawer-certificate"
									type="file"
									accept={PDF_OR_PHOTO_ACCEPT}
									bind:ref={certificateInput}
									onchange={pickCertificate}
								/>
								<Field.Description>A PDF or photo, up to 10 MB.</Field.Description>
							</Field.Root>
						{/if}
						<Field.Root>
							<div class="flex justify-between">
								<Field.Label for="training-drawer-notes">Notes</Field.Label>
								<span class="text-[13px] text-muted-foreground">Optional</span>
							</div>
							<Textarea
								id="training-drawer-notes"
								rows={3}
								placeholder="e.g. AHA BLS Provider, instructor SFC Diaz"
								bind:value={notes}
							/>
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
						editingId={draft.mode === 'correct' ? `${draft.kind}:${draft.id}` : null}
						onEdit={canRecord ? startCorrection : undefined}
					/>
				{/if}
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer class="items-center border-t px-7 py-4 sm:justify-between">
			{#if item?.canBeExempted && canExempt && draft.mode === 'log'}
				<Button
					variant="link"
					size="none"
					class="text-muted-foreground underline"
					disabled={saving.pending}
					onclick={() => saving.run(markExempt)}
				>
					Mark exempt
				</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				{#if draft.mode === 'correct'}
					<Button variant="outline" disabled={saving.pending} onclick={startLog}>Cancel correction</Button>
				{:else}
					<Button variant="outline" disabled={saving.pending} onclick={onClose}>Cancel</Button>
				{/if}
				{#if item && canRecord}
					<Button type="submit" form="training-drawer-form" disabled={saving.pending}>
						{draft.mode === 'log' ? 'Save completion' : 'Save correction'}
					</Button>
				{/if}
			</div>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
