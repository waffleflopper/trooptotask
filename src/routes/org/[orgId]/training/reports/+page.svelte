<script lang="ts">
	import { personnelTrainingsStore } from '$features/training';
	import { trainingTypesStore } from '$features/training';
	import { groupsStore } from '$features/personnel';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { rosterStore } from '$features/personnel';
	import { TrainingReportsPage } from '$features/training';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { TrainingWorkspaceResult } from '$features/training/contracts';
	import { isPromiseLike, materializeWorkspaceData, throwRenderError } from '$lib/utils/streamedRouteData';

	let { data } = $props();
	const org = getOrgContext();

	const hasServerReport = $derived(!!data.trainingReport);
	const streamedTraining = $derived(data.training?.data);
	const immediateTrainingBootstrap = $derived.by(() =>
		streamedTraining && !isPromiseLike(streamedTraining) ? (streamedTraining as TrainingWorkspaceResult) : null
	);
	const storesHydratedForOrg = $derived(
		rosterStore.orgId === org.orgId &&
			groupsStore.orgId === org.orgId &&
			trainingTypesStore.orgId === org.orgId &&
			personnelTrainingsStore.orgId === org.orgId
	);
	const storesPending = $derived(
		!storesHydratedForOrg ||
			rosterStore.loading ||
			groupsStore.loading ||
			trainingTypesStore.loading ||
			personnelTrainingsStore.loading
	);
	const immediateWorkspacePending = $derived(!hasServerReport && !!immediateTrainingBootstrap && storesPending);
	const pageData = $derived.by(() => pageDataFor(immediateTrainingBootstrap));

	function pageDataFor(trainingBootstrap: TrainingWorkspaceResult | null | undefined) {
		return materializeWorkspaceData(data, 'training', trainingBootstrap);
	}
</script>

<svelte:head>
	<title>Training Reports - Troop to Task</title>
</svelte:head>

{#if hasServerReport}
	<TrainingReportsPage {org} data={pageData} />
{:else if streamedTraining && isPromiseLike(streamedTraining)}
	{#await streamedTraining}
		<section
			class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
			aria-busy="true"
			aria-live="polite"
			role="status"
		>
			<Spinner class="size-4" />
			<p>Loading training reports...</p>
		</section>
	{:then resolvedTraining}
		{#if storesPending}
			<section
				class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
				aria-busy="true"
				aria-live="polite"
				role="status"
			>
				<Spinner class="size-4" />
				<p>Loading training reports...</p>
			</section>
		{:else}
			<TrainingReportsPage {org} data={pageDataFor(resolvedTraining)} />
		{/if}
	{:catch error}
		{throwRenderError(error, 'Failed to load training reports workspace')}
	{/await}
{:else if immediateWorkspacePending}
	<section
		class="flex items-center justify-center gap-2 p-6 text-muted-foreground"
		aria-busy="true"
		aria-live="polite"
		role="status"
	>
		<Spinner class="size-4" />
		<p>Loading training reports...</p>
	</section>
{:else}
	<TrainingReportsPage {org} data={pageData} />
{/if}
