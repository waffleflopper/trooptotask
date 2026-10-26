<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { resolve } from '$app/paths';
	import { pinnedGroupsStore } from '$features/personnel';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	type TrainingRecordSheetModule = typeof import('$features/training/components/TrainingRecordSheet.svelte');
	type SignInRosterModalModule = typeof import('$features/sign-in-rosters');

	let trainingRecordSheetModule: Promise<TrainingRecordSheetModule> | undefined;
	let signInRosterModalModule: Promise<SignInRosterModalModule> | undefined;

	function loadTrainingRecordSheet() {
		trainingRecordSheetModule ??= import('$features/training/components/TrainingRecordSheet.svelte');
		return trainingRecordSheetModule;
	}

	const recordPerson = $derived(ctx.recordPerson);
	const recordLoading = $derived(
		trainingTypesStore.orgId !== ctx.orgId ||
			personnelTrainingsStore.orgId !== ctx.orgId ||
			trainingTypesStore.loading ||
			personnelTrainingsStore.loading ||
			ctx.readinessAsOf === ''
	);

	let recordWasOpen = false;
	$effect(() => {
		const open = recordPerson !== null;
		if (recordWasOpen && !open) void ctx.restoreRecordFocus();
		recordWasOpen = open;
	});

	$effect(() => {
		if (ctx.rosterReady && ctx.recordPersonId && !recordPerson) ctx.dropRecordParam();
	});

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

{#if recordPerson}
	{#await loadTrainingRecordSheet() then { default: TrainingRecordSheet }}
		<TrainingRecordSheet
			person={recordPerson}
			trainingTypes={trainingTypesStore.items}
			trainings={personnelTrainingsStore.items}
			orgId={ctx.orgId}
			asOf={ctx.readinessAsOf}
			loading={recordLoading}
			profileHref={resolve('/org/[orgId]/personnel/[personnelSlug]', {
				orgId: ctx.orgUrlSegment,
				personnelSlug: recordPerson.slug ?? recordPerson.id
			})}
			canStep={{ previous: !!ctx.recordNeighbours.previous, next: !!ctx.recordNeighbours.next }}
			onStep={(direction) => ctx.stepRecord(direction)}
			onSave={ctx.handleSaveTraining.bind(ctx)}
			onSaveBatch={ctx.handleSaveTrainingBatch.bind(ctx)}
			onRemove={ctx.handleRemoveTraining.bind(ctx)}
			onToggleExempt={(typeId, exempt) => ctx.handleToggleExempt(typeId, recordPerson.id, exempt)}
			onClose={() => ctx.closeRecord()}
		/>
	{/await}
{/if}
