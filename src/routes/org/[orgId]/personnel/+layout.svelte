<script lang="ts">
	import { personnelWorkspaceHydrator } from '$features/personnel/personnelWorkspaceHydration.svelte';
	import { personnelRosterHydration, groupCatalogHydration, pinnedGroupsHydration } from '$features/personnel';
	import { calendarStatusHydration } from '$features/calendar';
	import type { PersonnelWorkspaceResult } from '$features/personnel/server/personnelWorkspaceBootstrap';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';

	let { children, data } = $props();
	let hydrationError = $state<Error | null>(null);
	const hydrationStores = {
		personnelStore: personnelRosterHydration,
		groupsStore: groupCatalogHydration,
		statusTypesStore: calendarStatusHydration,
		pinnedGroupsStore: pinnedGroupsHydration
	};
	const renderHydrationError = $derived.by(() => {
		if (hydrationError) {
			throwRenderError(hydrationError, 'Failed to hydrate personnel workspace');
		}
		return null;
	});

	$effect(() => {
		hydrationError = null;

		return hydrateStreamedWorkspace<PersonnelWorkspaceResult>({
			streamedWorkspace: data.personnel,
			fallbackMessage: 'Failed to hydrate personnel workspace',
			hydrate: (personnel) => personnelWorkspaceHydrator.hydrate(personnel.hydration, hydrationStores),
			onReject: (error) => {
				hydrationError = error;
			}
		});
	});
</script>

{#if hydrationError}
	{renderHydrationError}
{:else}
	{@render children()}
{/if}
