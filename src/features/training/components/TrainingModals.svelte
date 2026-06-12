<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	// Typed payloads
	type RecordPayload = { person: Personnel; type: TrainingType; training?: PersonnelTraining };
	type PersonEditorPayload = { person: Personnel };
	type TrainingRecordModalModule = typeof import('$features/training/components/TrainingRecordModal.svelte');
	type PersonTrainingEditorModule = typeof import('$features/training/components/PersonTrainingEditor.svelte');
	type BulkTrainingImporterModule = typeof import('$features/training/components/BulkTrainingImporter.svelte');
	type SignInRosterModalModule = typeof import('$features/sign-in-rosters/components/SignInRosterModal.svelte');

	let trainingRecordModalModule: Promise<TrainingRecordModalModule> | undefined;
	let personTrainingEditorModule: Promise<PersonTrainingEditorModule> | undefined;
	let bulkTrainingImporterModule: Promise<BulkTrainingImporterModule> | undefined;
	let signInRosterModalModule: Promise<SignInRosterModalModule> | undefined;

	function loadTrainingRecordModal() {
		trainingRecordModalModule ??= import('$features/training/components/TrainingRecordModal.svelte');
		return trainingRecordModalModule;
	}

	function loadPersonTrainingEditor() {
		personTrainingEditorModule ??= import('$features/training/components/PersonTrainingEditor.svelte');
		return personTrainingEditorModule;
	}

	function loadBulkTrainingImporter() {
		bulkTrainingImporterModule ??= import('$features/training/components/BulkTrainingImporter.svelte');
		return bulkTrainingImporterModule;
	}

	function loadSignInRosterModal() {
		signInRosterModalModule ??= import('$features/sign-in-rosters/components/SignInRosterModal.svelte');
		return signInRosterModalModule;
	}
</script>

{#if modals.isOpen('record')}
	{@const p = modals.payload<RecordPayload>('record')}
	{#if p}
		{#await loadTrainingRecordModal() then { default: TrainingRecordModal }}
			<TrainingRecordModal
				person={p.person}
				trainingType={p.type}
				existingTraining={p.training}
				onSave={ctx.handleSaveTraining.bind(ctx)}
				onRemove={ctx.handleRemoveTraining.bind(ctx)}
				onClose={modals.closerFor('record')}
				canBeExempted={p.type.canBeExempted}
				isExempt={ctx.isExempt(p.person, p.type)}
				onToggleExempt={(exempt) => {
					ctx.handleToggleExempt(p.type.id, p.person.id, exempt);
					modals.close('record');
				}}
			/>
		{/await}
	{/if}
{/if}

{#if modals.isOpen('sign-in-rosters')}
	{#await loadSignInRosterModal() then { default: SignInRosterModal }}
		<SignInRosterModal
			orgId={ctx.orgId}
			personnel={ctx.personnel}
			groups={ctx.groups}
			canEdit={ctx.canRecordTraining}
			onClose={modals.closerFor('sign-in-rosters')}
		/>
	{/await}
{/if}

{#if modals.isOpen('bulk-import')}
	{#await loadBulkTrainingImporter() then { default: BulkTrainingImporter }}
		<BulkTrainingImporter
			orgId={ctx.orgId}
			personnel={ctx.personnel}
			trainingTypes={trainingTypesStore.items}
			onImportComplete={ctx.handleBulkImportComplete.bind(ctx)}
			onClose={modals.closerFor('bulk-import')}
		/>
	{/await}
{/if}

{#if modals.isOpen('person-editor')}
	{@const pe = modals.payload<PersonEditorPayload>('person-editor')}
	{#if pe}
		{#await loadPersonTrainingEditor() then { default: PersonTrainingEditor }}
			<PersonTrainingEditor
				person={pe.person}
				trainingTypes={trainingTypesStore.items}
				trainings={personnelTrainingsStore.items}
				onSave={ctx.handleSaveTraining.bind(ctx)}
				onSaveBatch={ctx.handleSaveTrainingBatch.bind(ctx)}
				onRemove={ctx.handleRemoveTraining.bind(ctx)}
				onClose={modals.closerFor('person-editor')}
				onToggleExempt={(typeId, exempt) => ctx.handleToggleExempt(typeId, pe.person.id, exempt)}
			/>
		{/await}
	{/if}
{/if}
