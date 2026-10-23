<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { lastFirstSplitter, rosterPersonReference, rosterStore } from '$features/personnel';
	import {
		createTrainingImportLane,
		personnelTrainingsStore,
		trainingTypesStore,
		type TrainingImportColumns
	} from '$features/training';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { ImportFlow } from '$lib/components/patterns/import-flow';

	const org = getAppShellContext();

	const sources = [rosterStore, trainingTypesStore, personnelTrainingsStore];
	const ready = $derived(sources.every((store) => store.orgId === org.orgId && !store.loading));
	const lane = $derived(
		ready
			? createTrainingImportLane({
					orgId: org.orgId,
					orgUrlSegment: org.orgUrlSegment,
					person: rosterPersonReference<TrainingImportColumns>(
						rosterStore.readModel({ fallbackGroupName: org.orgName }).scoped(org.scopeSet, { status: 'active' })
							.flatPersonnel
					),
					nameSplitter: lastFirstSplitter<TrainingImportColumns>(),
					trainingTypes: [...trainingTypesStore.items].sort((a, b) => a.sortOrder - b.sortOrder),
					trainings: personnelTrainingsStore.items,
					canConfigureRequirements: org.affordanceForFeatureAction(
						POLICY_ACTION_CATALOG.training.configureRequirements,
						{ kind: 'organization' }
					).allowed
				})
			: null
	);
</script>

<svelte:head>
	<title>Import training - Troop to Task</title>
</svelte:head>

{#key org.orgId}
	<ImportFlow {lane} title="Import training" eyebrow="Training · Import" />
{/key}
