<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import { pinnedGroupsStore } from '$features/personnel';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	type PersonEditorPayload = { person: Personnel };
	type PersonTrainingEditorModule = typeof import('$features/training/components/PersonTrainingEditor.svelte');
	type SignInRosterModalModule = typeof import('$features/sign-in-rosters');

	let personTrainingEditorModule: Promise<PersonTrainingEditorModule> | undefined;
	let signInRosterModalModule: Promise<SignInRosterModalModule> | undefined;

	function loadPersonTrainingEditor() {
		personTrainingEditorModule ??= import('$features/training/components/PersonTrainingEditor.svelte');
		return personTrainingEditorModule;
	}

	function loadSignInRosterModal() {
		signInRosterModalModule ??= import('$features/sign-in-rosters');
		return signInRosterModalModule;
	}
</script>

{#if modals.isOpen('sign-in-rosters')}
	{#await loadSignInRosterModal() then { SignInRosterModal }}
		<SignInRosterModal
			orgId={ctx.orgId}
			personnel={ctx.personnel}
			groups={ctx.groups}
			pinnedGroups={pinnedGroupsStore.orgId === ctx.orgId ? pinnedGroupsStore.list : []}
			rankCatalog={ctx.rankCatalog}
			canEdit={ctx.canRecordTraining}
			onClose={modals.closerFor('sign-in-rosters')}
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
