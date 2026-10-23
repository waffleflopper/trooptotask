<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import {
		createIctCompletionImportLane,
		ictTasksStore,
		personnelIctCompletionsStore,
		type IctCompletionImportColumns
	} from '$features/critical-tasks';
	import { lastFirstSplitter, rosterPersonReference, rosterStore } from '$features/personnel';
	import { ImportFlow } from '$lib/components/patterns/import-flow';

	const org = getAppShellContext();

	const sources = [rosterStore, ictTasksStore, personnelIctCompletionsStore];
	const ready = $derived(sources.every((store) => store.orgId === org.orgId && !store.loading));
	const lane = $derived(
		ready
			? createIctCompletionImportLane({
					orgUrlSegment: org.orgUrlSegment,
					person: rosterPersonReference<IctCompletionImportColumns>(
						rosterStore.readModel({ fallbackGroupName: org.orgName }).scoped(org.scopeSet, { status: 'active' })
							.flatPersonnel
					),
					nameSplitter: lastFirstSplitter<IctCompletionImportColumns>(),
					tasks: ictTasksStore.items,
					completions: personnelIctCompletionsStore.items
				})
			: null
	);
</script>

<svelte:head>
	<title>Import critical task completions - Troop to Task</title>
</svelte:head>

{#key org.orgId}
	<ImportFlow {lane} title="Import completions" eyebrow="Critical Tasks · Import" />
{/key}
