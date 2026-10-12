<script lang="ts">
	import {
		personnelWorkspaceHydrator,
		personnelRosterHydration,
		groupCatalogHydration,
		pinnedGroupsHydration
	} from '$features/personnel';
	import { calendarStatusHydration } from '$features/calendar';
	import type { PersonnelWorkspaceRestricted, PersonnelWorkspaceResult } from '$features/personnel/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import WorkspaceAccessRestricted from '../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../WorkspaceLoadError.svelte';

	let { children, data } = $props();
	let hydrationError = $state<{ orgId: string; error: Error } | null>(null);
	let hydratedOrgId = $state<string | null>(null);
	let restrictedOrgId = $state<string | null>(null);
	const hydrationStores = {
		personnelStore: personnelRosterHydration,
		groupsStore: groupCatalogHydration,
		statusTypesStore: calendarStatusHydration,
		pinnedGroupsStore: pinnedGroupsHydration
	};

	$effect(() => {
		const orgId = data.shell.org.id;
		let cancelled = false;
		hydrationError = null;
		restrictedOrgId = null;

		const stop = hydrateStreamedWorkspace<PersonnelWorkspaceResult | PersonnelWorkspaceRestricted>({
			streamedWorkspace: data.personnel,
			fallbackMessage: 'Failed to hydrate personnel workspace',
			hydrate: async (personnel) => {
				if ('access' in personnel) {
					if (cancelled) return;
					personnelWorkspaceHydrator.restrict(hydrationStores);
					restrictedOrgId = orgId;
					return;
				}
				await personnelWorkspaceHydrator.hydrate(personnel.hydration, hydrationStores);
				if (!cancelled) hydratedOrgId = orgId;
			},
			onReject: (error) => {
				hydrationError = { orgId, error };
			}
		});
		return () => {
			cancelled = true;
			stop();
		};
	});
</script>

{#if hydrationError && hydrationError.orgId === data.shell.org.id && hydratedOrgId !== data.shell.org.id}
	<WorkspaceLoadError subject="Personnel" />
{:else if restrictedOrgId === data.shell.org.id}
	<WorkspaceAccessRestricted subject="personnel" />
{:else}
	{#if hydrationError && hydrationError.orgId === data.shell.org.id}
		<Alert.Root variant="warning">
			<Alert.Description>
				The roster could not be refreshed. Showing the last loaded roster; refresh to check the latest records.
			</Alert.Description>
		</Alert.Root>
	{/if}
	{@render children()}
{/if}
