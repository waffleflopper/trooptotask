<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { beforeNavigate } from '$app/navigation';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import type { Personnel } from '$features/personnel/contracts';
	import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
	import type { TrainingBatchRecord } from '$features/training/contracts';
	import { calculateExpirationDate } from '$features/training/utils/trainingStatus';
	import {
		buildTrainingRecordSheet,
		type ReadinessSegment,
		type RecordSheetItem
	} from '$features/training/utils/trainingRecordSheetModel';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import TrainingRecordItem, { type RecordSection } from './TrainingRecordItem.svelte';

	type BatchRecord = TrainingBatchRecord & { status: 'completed' };

	interface Props {
		person: Personnel;
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		orgId: string;
		/** The Organization's calendar day: what Today records. */
		asOf: string;
		/** True until the types, records and day this sheet reads are in. */
		loading: boolean;
		profileHref: string;
		/** Exempting changes the training type, which only people who configure types may do. */
		canExempt: boolean;
		canStep: { previous: boolean; next: boolean };
		onStep: (direction: -1 | 1) => void;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onSaveBatch: (records: BatchRecord[]) => Promise<void>;
		onRemove: (id: string, isCurrent?: () => boolean) => Promise<void>;
		onToggleExempt: (typeId: string, exempt: boolean) => Promise<void>;
		onClose: () => void;
	}

	let {
		person,
		trainingTypes,
		trainings,
		orgId,
		asOf,
		loading,
		profileHref,
		canExempt,
		canStep,
		onStep,
		onSave,
		onSaveBatch,
		onRemove,
		onToggleExempt,
		onClose
	}: Props = $props();

	const startOrgId = untrack(() => orgId);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const sameSheet = (personId: string) => !disposed && orgId === startOrgId && person.id === personId;

	const saving = new PendingSave();
	let formDirty = $state(false);
	let saveError = $state<string | null>(null);
	let expandedTypeId = $state<string | null>(null);
	/** The open form fixes the stored record, so it starts from that record's date; otherwise it renews from today. */
	let correcting = $state(false);
	let seededFor: string | null = null;
	let titleElement = $state<HTMLElement | null>(null);
	let bodyElement = $state<HTMLDivElement | null>(null);

	// A renewal moves its row to Current as soon as the store takes it. The form stays where it is until the save
	// settles, so a refused save leaves the draft and its error in place.
	let settling = $state.raw<PersonnelTraining[] | null>(null);
	const sheet = $derived(
		buildTrainingRecordSheet({ person, types: trainingTypes, records: settling ?? trainings, asOf })
	);
	const total = $derived(sheet.segments.length);
	const group = $derived(person.groupName || 'Unassigned');
	const subline = $derived([person.mos, person.clinicRole].filter(Boolean).join(' · '));

	$effect(() => {
		if (loading || seededFor === person.id) return;
		seededFor = person.id;
		saveError = null;
		formDirty = false;
		expandedTypeId = untrack(() => sheet.needsAction[0]?.type.id ?? null);
		correcting = false;
	});

	const sections = $derived<Array<{ id: RecordSection; label: string; items: RecordSheetItem[] }>>([
		{ id: 'needs-action', label: 'Needs action', items: sheet.needsAction },
		{ id: 'current', label: 'Current', items: sheet.current },
		{ id: 'not-required', label: 'Not required', items: sheet.notRequired },
		{ id: 'exempt', label: 'Exempt', items: sheet.exempt }
	]);

	const segmentClass: Record<ReadinessSegment, string> = {
		ready: 'bg-foreground',
		expiring: 'bg-warning',
		expired: 'bg-destructive',
		missing: 'border-2 border-destructive'
	};

	/** A row that changed section unmounts its form, so leave nothing expanded on it. */
	function collapse(...typeIds: string[]) {
		if (expandedTypeId && typeIds.includes(expandedTypeId)) open(null);
	}

	// What to do once the user agrees to drop the open form's changes.
	let afterDiscard = $state.raw<(() => void) | null>(null);

	function open(typeId: string | null, isCorrection = false) {
		expandedTypeId = typeId;
		correcting = typeId !== null && isCorrection;
	}

	function expand(typeId: string | null, isCorrection = false) {
		// A pending form stays mounted, so a refused save can still show its error.
		if (saving.pending) return;
		if (typeId === expandedTypeId && (typeId === null || isCorrection === correcting)) return;
		if (formDirty) afterDiscard = () => open(typeId, isCorrection);
		else open(typeId, isCorrection);
	}

	function toggle(typeId: string) {
		expand(expandedTypeId === typeId ? null : typeId);
	}

	function discardDraft() {
		const proceed = afterDiscard;
		afterDiscard = null;
		proceed?.();
	}

	async function focusNextAction() {
		await tick();
		const next = bodyElement?.querySelector<HTMLElement>('[data-today-button]:not(:disabled)');
		(next ?? titleElement)?.focus();
	}

	function reportFailure(typeName: string | undefined, error: unknown) {
		const message = error instanceof Error && error.message.trim() ? error.message : 'Could not save. Try again.';
		saveError = typeName ? `${typeName}: ${message}` : message;
	}

	async function recordToday(item: RecordSheetItem) {
		const personId = person.id;
		saveError = null;
		let saved = false;
		await saving.run(async () => {
			try {
				await onSave({
					personnelId: personId,
					trainingTypeId: item.type.id,
					completionDate: asOf,
					expirationDate: calculateExpirationDate(asOf, item.type.expirationMonths),
					notes: null,
					certificateUrl: null
				});
				saved = true;
			} catch (error) {
				if (sameSheet(personId)) reportFailure(item.type.name, error);
			}
		});
		if (!saved || !sameSheet(personId)) return;
		collapse(item.type.id);
		await focusNextAction();
	}

	async function saveFromForm(item: RecordSheetItem, data: Omit<PersonnelTraining, 'id'>) {
		if (saving.pending) return;
		const personId = person.id;
		const isUpdate = !!item.record;
		await saving.run(async () => {
			settling = trainings;
			try {
				await onSave(data);
				if (sameSheet(personId)) collapse(item.type.id);
			} finally {
				settling = null;
			}
		});
		if (!sameSheet(personId)) return;
		toast.success(isUpdate ? 'Training record updated' : 'Training record saved');
		await focusNextAction();
	}

	let confirmRecordAll = $state(false);

	async function recordAll() {
		if (saving.pending) return;
		const personId = person.id;
		const records = sheet.recordableToday.map(
			(item): BatchRecord => ({
				personnelId: personId,
				trainingTypeId: item.type.id,
				completionDate: asOf,
				notes: undefined,
				status: 'completed'
			})
		);
		try {
			await saving.run(() => onSaveBatch(records));
		} catch (error) {
			if (sameSheet(personId))
				toast.error(error instanceof Error ? error.message : 'Could not record. Try again.', { duration: 6000 });
			return;
		}
		if (!sameSheet(personId)) return;
		confirmRecordAll = false;
		collapse(...records.map((record) => record.trainingTypeId));
		await focusNextAction();
	}

	let confirmRemoveTypeId = $state<string | null>(null);

	async function removeRecord() {
		const personId = person.id;
		const typeId = confirmRemoveTypeId;
		const record = sheet.needsAction
			.concat(sheet.current, sheet.notRequired)
			.find((item) => item.type.id === typeId)?.record;
		if (!record) {
			confirmRemoveTypeId = null;
			return;
		}
		let removed = false;
		await saving.run(async () => {
			try {
				await onRemove(record.id, () => sameSheet(personId));
				removed = true;
			} catch (error) {
				if (sameSheet(personId))
					toast.error(error instanceof Error ? error.message : 'Could not remove training record. Try again.', {
						duration: 6000
					});
			}
		});
		if (!removed || !sameSheet(personId)) return;
		confirmRemoveTypeId = null;
		if (typeId) collapse(typeId);
	}

	async function setExempt(item: RecordSheetItem, exempt: boolean, discarded = false) {
		if (saving.pending) return;
		if (!discarded && formDirty && expandedTypeId === item.type.id) {
			afterDiscard = () => void setExempt(item, exempt, true);
			return;
		}
		const personId = person.id;
		saveError = null;
		await saving.run(() => onToggleExempt(item.type.id, exempt));
		if (sameSheet(personId)) collapse(item.type.id);
	}

	const busy = $derived(saving.pending);

	beforeNavigate((navigation) => {
		if (busy || formDirty) navigation.cancel();
	});

	async function step(direction: -1 | 1) {
		if (busy || formDirty || !(direction === -1 ? canStep.previous : canStep.next)) return;
		onStep(direction);
		await tick();
		titleElement?.focus();
	}

	function stepWithArrows(event: KeyboardEvent) {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable], [role=menu], [role=listbox], [role=grid]')
		)
			return;
		event.preventDefault();
		void step(event.key === 'ArrowUp' ? -1 : 1);
	}
</script>

<AppDialog.Root open {busy} closeBlocked={formDirty} {onClose}>
	<AppDialog.Content
		presentation="sheet"
		onkeydown={stepWithArrows}
		onCloseAutoFocus={(event) => event.preventDefault()}
	>
		<AppDialog.Header eyebrow={`Training record · ${group}`} class="border-b pr-12 pb-4">
			<AppDialog.Title
				class="font-heading text-3xl leading-8 font-extrabold uppercase focus-visible:outline-none"
				tabindex={-1}
				bind:ref={titleElement}
			>
				{person.rank}
				{person.firstName}
				{person.lastName}
			</AppDialog.Title>
			{#if subline}
				<AppDialog.Description>{subline}</AppDialog.Description>
			{/if}
			{#if loading}
				<div class="grid gap-2 pt-2" role="status" aria-label="Loading training record">
					<Skeleton class="h-1.5 w-full" />
					<Skeleton class="h-4 w-40" />
				</div>
			{:else if total > 0}
				<div class="grid gap-2 pt-2">
					<div class="flex gap-1" aria-hidden="true">
						{#each sheet.segments as segment, index (index)}
							<span class={['h-1.5 flex-1', segmentClass[segment]]}></span>
						{/each}
					</div>
					<div class="flex items-baseline justify-between font-mono text-xs">
						<span>{sheet.ready} of {total} ready</span>
						{#if sheet.toRecord > 0}
							<span class="text-danger-foreground">{sheet.toRecord} to record</span>
						{/if}
					</div>
				</div>
			{/if}
		</AppDialog.Header>

		<AppDialog.Body class="flex flex-col gap-6 px-4 py-4" bind:ref={bodyElement}>
			{#if saveError}
				<Alert.Root variant="destructive">
					<Alert.Title>Training record was not saved</Alert.Title>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if loading}
				<div class="grid gap-3" role="status" aria-label="Loading training items">
					{#each Array.from({ length: 5 }) as _, index (index)}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else}
				{#key person.id}
					{#each sections as section (section.id)}
						{#if section.items.length > 0}
							<section aria-label={section.label}>
								<div class="flex items-baseline justify-between pb-1">
									<h3 class="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
										{section.label} · {section.items.length}
									</h3>
									{#if section.id === 'needs-action' && sheet.recordableToday.length > 0}
										<Button
											variant="link"
											size="none"
											class="text-sm text-foreground underline"
											disabled={busy}
											onclick={() => (confirmRecordAll = true)}
										>
											Record all {sheet.recordableToday.length} today
										</Button>
									{:else if section.id === 'current'}
										<span class="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
											Done · until
										</span>
									{/if}
								</div>
								<ul>
									{#each section.items as item (item.type.id)}
										<TrainingRecordItem
											{item}
											section={section.id}
											{person}
											{orgId}
											{asOf}
											expanded={expandedTypeId === item.type.id}
											correcting={expandedTypeId === item.type.id && correcting}
											{busy}
											{canExempt}
											isCurrent={() => sameSheet(person.id) && expandedTypeId === item.type.id}
											onToggle={() => toggle(item.type.id)}
											onEdit={() => expand(item.type.id, true)}
											onToday={() => void recordToday(item)}
											onExempt={(exempt) => void setExempt(item, exempt)}
											onDelete={() => (confirmRemoveTypeId = item.type.id)}
											onSave={(data) => saveFromForm(item, data)}
											onDirtyChange={(dirty) => (formDirty = dirty)}
										/>
									{/each}
								</ul>
							</section>
						{/if}
					{/each}
				{/key}
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer class="items-center border-t px-4 py-3 sm:justify-between">
			<div class="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Previous Soldier"
					disabled={busy || formDirty || !canStep.previous}
					onclick={() => step(-1)}
				>
					<ChevronUpIcon />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Next Soldier"
					disabled={busy || formDirty || !canStep.next}
					onclick={() => step(1)}
				>
					<ChevronDownIcon />
				</Button>
				<span class="ml-1 font-mono text-xs text-muted-foreground max-sm:hidden">↑ ↓ next Soldier</span>
			</div>
			<Button variant="outline" href={profileHref} disabled={busy || formDirty}>Open profile</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmRecordAll}
	{@const count = sheet.recordableToday.length}
	<ConfirmDialog
		title="Record all today"
		message="Record {count} {count === 1
			? 'training'
			: 'trainings'} as completed today? Trainings that take the date from the card are skipped; set those one by one."
		confirmLabel="Record {count}"
		variant="default"
		onConfirm={recordAll}
		onCancel={() => (confirmRecordAll = false)}
	/>
{/if}

{#if afterDiscard}
	<ConfirmDialog
		title="Discard changes?"
		message="This training record has changes that are not saved."
		confirmLabel="Discard"
		onConfirm={discardDraft}
		onCancel={() => (afterDiscard = null)}
	/>
{/if}

{#if confirmRemoveTypeId}
	<ConfirmDialog
		title="Remove Training Record"
		message="Are you sure you want to remove this training record?"
		confirmLabel="Delete"
		onConfirm={removeRecord}
		onCancel={() => (confirmRemoveTypeId = null)}
	/>
{/if}
