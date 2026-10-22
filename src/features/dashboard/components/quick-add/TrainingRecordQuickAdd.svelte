<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		loadPersonTrainingRecords,
		loadTrainingRecordModal,
		saveTrainingRecord,
		type PersonnelTraining,
		type TrainingType
	} from '$features/training';
	import type { Personnel } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { actionablePersonnel, type QuickAddDialogProps } from '../../sections/dashboardSections';
	import QuickAddPersonPicker from './QuickAddPersonPicker.svelte';

	let { model, access, updates, onClose }: QuickAddDialogProps = $props();

	const orgId = $derived(model.data.orgId);
	let typeId = $state('');
	let editing = $state.raw<{
		TrainingRecordModal: Awaited<ReturnType<typeof loadTrainingRecordModal>>['default'];
		person: Personnel;
		type: TrainingType;
		existing: PersonnelTraining | undefined;
	} | null>(null);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const people = $derived(
		actionablePersonnel(model.inputs.personnel, access, POLICY_ACTION_CATALOG.training.recordCompletions)
	);
	const types = $derived(
		[...model.data.dashboard.data.trainingTypes].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		)
	);
	const typeOptions = $derived(types.map((type) => ({ value: type.id, label: type.name })));
	const selectedType = $derived(types.find((candidate) => candidate.id === typeId));

	// The record editor shows nothing to save for an exemption, and lifting one belongs to the Training page.
	function isExempt(person: Personnel, type: TrainingType) {
		return type.canBeExempted && type.exemptPersonnelIds.includes(person.id);
	}

	async function openRecord(person: Personnel) {
		const type = selectedType;
		if (!type) return;
		const [records, { default: TrainingRecordModal }] = await Promise.all([
			loadPersonTrainingRecords(orgId, person.id),
			loadTrainingRecordModal()
		]);
		if (active)
			editing = {
				TrainingRecordModal,
				person,
				type,
				existing: records.find((record) => record.trainingTypeId === type.id)
			};
	}

	async function save(record: Omit<PersonnelTraining, 'id'>) {
		const savedIn = orgId;
		await saveTrainingRecord(savedIn, record);
		if (savedIn === model.data.orgId) updates.refreshSummary();
	}
</script>

{#if editing}
	<editing.TrainingRecordModal
		person={editing.person}
		trainingType={editing.type}
		existingTraining={editing.existing}
		onSave={save}
		{onClose}
	/>
{:else}
	<QuickAddPersonPicker
		title="Add training record"
		description="Choose the person and the training."
		{people}
		ready={(person) => selectedType !== undefined && !isExempt(person, selectedType)}
		failureMessage="Could not load this person's training records. Try again."
		onContinue={openRecord}
		{onClose}
	>
		{#snippet children({ busy, person })}
			<Field.Root>
				<Field.Label for="quick-add-training-type">Training</Field.Label>
				<Combobox.Root items={typeOptions} bind:value={typeId} label="Training" autoHighlight disabled={busy}>
					<Combobox.Trigger id="quick-add-training-type" placeholder="Search for a training..." aria-label="Training" />
					<Combobox.Content>
						<Combobox.Search placeholder="Search for a training..." />
						<Combobox.Empty>No matches</Combobox.Empty>
						<Combobox.List />
					</Combobox.Content>
				</Combobox.Root>
				{#if person && selectedType && isExempt(person, selectedType)}
					<Field.Description>
						{person.rank}
						{person.lastName} is exempt from {selectedType.name}. Change exemptions on the Training page.
					</Field.Description>
				{/if}
			</Field.Root>
		{/snippet}
	</QuickAddPersonPicker>
{/if}
