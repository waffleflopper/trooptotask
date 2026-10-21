<script lang="ts">
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
	import { personnelResource, type QuickAddDialogProps } from '../../sections/dashboardSections';
	import QuickAddPersonPicker from './QuickAddPersonPicker.svelte';

	let { model, access, updates, onClose }: QuickAddDialogProps = $props();

	const trainingRecordModal = loadTrainingRecordModal();
	const orgId = $derived(model.data.orgId);
	let typeId = $state('');
	let editing = $state<{ person: Personnel; type: TrainingType; existing: PersonnelTraining | undefined } | null>(null);

	const people = $derived(
		model.inputs.personnel.filter((person) =>
			access.can(POLICY_ACTION_CATALOG.training.recordCompletions, personnelResource(person))
		)
	);
	const types = $derived(
		[...model.data.dashboard.data.trainingTypes].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		)
	);
	const typeOptions = $derived(types.map((type) => ({ value: type.id, label: type.name })));

	async function openRecord(person: Personnel) {
		const type = types.find((candidate) => candidate.id === typeId);
		if (!type) return;
		const [records] = await Promise.all([loadPersonTrainingRecords(orgId, person.id), trainingRecordModal]);
		editing = { person, type, existing: records.find((record) => record.trainingTypeId === type.id) };
	}

	async function save(record: Omit<PersonnelTraining, 'id'>) {
		const savedIn = orgId;
		await saveTrainingRecord(savedIn, record);
		if (savedIn === model.data.orgId) updates.refreshSummary();
	}
</script>

{#if editing}
	{#await trainingRecordModal then { default: TrainingRecordModal }}
		<TrainingRecordModal
			person={editing.person}
			trainingType={editing.type}
			existingTraining={editing.existing}
			isExempt={editing.type.canBeExempted && editing.type.exemptPersonnelIds.includes(editing.person.id)}
			onSave={save}
			{onClose}
		/>
	{/await}
{:else}
	<QuickAddPersonPicker
		title="Add training record"
		description="Choose the person and the training."
		{people}
		ready={typeId !== ''}
		failureMessage="Could not load this person's training records. Try again."
		onContinue={openRecord}
		{onClose}
	>
		{#snippet children({ busy })}
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
			</Field.Root>
		{/snippet}
	</QuickAddPersonPicker>
{/if}
