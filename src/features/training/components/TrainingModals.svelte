<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { resolve } from '$app/paths';
	import { pinnedGroupsStore } from '$features/personnel';
	import LazySheet, { lazyModule } from './LazySheet.svelte';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	type SignInRosterModalModule = typeof import('$features/sign-in-rosters');
	type ManageViewsPayload = { returnFocusTo: () => HTMLElement | null };

	let signInRosterModalModule: Promise<SignInRosterModalModule> | undefined;

	const loadTrainingRecordSheet = lazyModule(() => import('$features/training/components/TrainingRecordSheet.svelte'));
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

	const loadTrainingViewsSheet = lazyModule(() => import('$features/training/components/TrainingViewsSheet.svelte'));

	const loadTrainingViewsSheet = lazyModule(() => import('$features/training/components/TrainingViewsSheet.svelte'));

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
	{@const person = recordPerson}
	<LazySheet
		load={loadTrainingRecordSheet}
		title={`${person.rank} ${person.firstName} ${person.lastName}`}
		onClose={() => ctx.closeRecord()}
	>
		{#snippet children({ default: TrainingRecordSheet })}
			<TrainingRecordSheet
				{person}
				trainingTypes={trainingTypesStore.items}
				trainings={personnelTrainingsStore.items}
				orgId={ctx.orgId}
				asOf={ctx.readinessAsOf}
				loading={recordLoading}
				canExempt={ctx.trainingConfigureAffordance.allowed}
				profileHref={resolve('/org/[orgId]/personnel/[personnelSlug]', {
					orgId: ctx.orgUrlSegment,
					personnelSlug: person.slug ?? person.id
				})}
				canStep={{ previous: !!ctx.recordNeighbours.previous, next: !!ctx.recordNeighbours.next }}
				onStep={(direction) => ctx.stepRecord(direction)}
				onSave={ctx.handleSaveTraining.bind(ctx)}
				onSaveBatch={ctx.handleSaveTrainingBatch.bind(ctx)}
				onRemove={ctx.handleRemoveTraining.bind(ctx)}
				onToggleExempt={(typeId, exempt) => ctx.handleToggleExempt(typeId, person.id, exempt)}
				onClose={() => ctx.closeRecord()}
			/>
		{/snippet}
	</LazySheet>
{/if}

{#if modals.isOpen('manage-views')}
	{@const mv = modals.payload<ManageViewsPayload>('manage-views')}
	<LazySheet load={loadTrainingViewsSheet} title="Manage views" onClose={modals.closerFor('manage-views')}>
		{#snippet children({ default: TrainingViewsSheet })}
			<TrainingViewsSheet
				orgId={ctx.orgId}
				canMutate={ctx.trainingConfigureAffordance.allowed}
				saveView={ctx.saveView.bind(ctx)}
				deleteView={ctx.deleteView.bind(ctx)}
				returnFocusTo={mv?.returnFocusTo}
				onClose={modals.closerFor('manage-views')}
			/>
		{/snippet}
	</LazySheet>
{/if}

{#if modals.isOpen('manage-views')}
	{@const mv = modals.payload<ManageViewsPayload>('manage-views')}
	<LazySheet load={loadTrainingViewsSheet} title="Manage views" onClose={modals.closerFor('manage-views')}>
		{#snippet children({ default: TrainingViewsSheet })}
			<TrainingViewsSheet
				orgId={ctx.orgId}
				canMutate={ctx.trainingConfigureAffordance.allowed}
				saveView={ctx.saveView.bind(ctx)}
				deleteView={ctx.deleteView.bind(ctx)}
				returnFocusTo={mv?.returnFocusTo}
				onClose={modals.closerFor('manage-views')}
			/>
		{/snippet}
	</LazySheet>
{/if}
