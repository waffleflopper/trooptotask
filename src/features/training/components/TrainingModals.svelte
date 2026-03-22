<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import TrainingRecordModal from '$features/training/components/TrainingRecordModal.svelte';
	import PersonTrainingEditor from '$features/training/components/PersonTrainingEditor.svelte';
	import TrainingTypeManager from '$features/training/components/TrainingTypeManager.svelte';
	import TrainingTypeReorder from '$features/training/components/TrainingTypeReorder.svelte';
	import TrainingReports from '$features/training/components/TrainingReports.svelte';
	import BulkTrainingImporter from '$features/training/components/BulkTrainingImporter.svelte';
	import SignInRosterModal from '$features/sign-in-rosters/components/SignInRosterModal.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	// Typed payloads
	type RecordPayload = { person: Personnel; type: TrainingType; training?: PersonnelTraining };
	type PersonEditorPayload = { person: Personnel };
</script>

{#if modals.isOpen('record')}
	{@const p = modals.payload<RecordPayload>('record')}
	{#if p}
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
	{/if}
{/if}

{#if modals.isOpen('type-manager')}
	<TrainingTypeManager
		trainingTypes={trainingTypesStore.items}
		availableRoles={ctx.availableRoles}
		onAdd={ctx.handleAddType.bind(ctx)}
		onUpdate={ctx.handleUpdateType.bind(ctx)}
		onRemove={ctx.handleRemoveType.bind(ctx)}
		onClose={modals.closerFor('type-manager')}
	/>
{/if}

{#if modals.isOpen('type-reorder')}
	<TrainingTypeReorder
		trainingTypes={trainingTypesStore.items}
		onUpdate={ctx.handleUpdateType.bind(ctx)}
		onClose={modals.closerFor('type-reorder')}
	/>
{/if}

{#if modals.isOpen('reports')}
	<TrainingReports
		personnel={ctx.filteredPersonnel}
		trainingTypes={trainingTypesStore.items}
		trainings={personnelTrainingsStore.items}
		groups={ctx.groups}
		onClose={modals.closerFor('reports')}
	/>
{/if}

{#if modals.isOpen('sign-in-rosters')}
	<SignInRosterModal
		orgId={ctx.orgId}
		personnel={ctx.personnel}
		groups={ctx.groups}
		canEdit={ctx.canEditTraining}
		onClose={modals.closerFor('sign-in-rosters')}
	/>
{/if}

{#if modals.isOpen('bulk-import')}
	<BulkTrainingImporter
		orgId={ctx.orgId}
		personnel={ctx.personnel}
		trainingTypes={trainingTypesStore.items}
		onImportComplete={ctx.handleBulkImportComplete.bind(ctx)}
		onClose={modals.closerFor('bulk-import')}
	/>
{/if}

{#if modals.isOpen('person-editor')}
	{@const pe = modals.payload<PersonEditorPayload>('person-editor')}
	{#if pe}
		<PersonTrainingEditor
			person={pe.person}
			trainingTypes={trainingTypesStore.items}
			trainings={personnelTrainingsStore.items}
			onSave={ctx.handleSaveTraining.bind(ctx)}
			onRemove={ctx.handleRemoveTraining.bind(ctx)}
			onClose={modals.closerFor('person-editor')}
			onToggleExempt={(typeId, exempt) => ctx.handleToggleExempt(typeId, pe.person.id, exempt)}
		/>
	{/if}
{/if}
