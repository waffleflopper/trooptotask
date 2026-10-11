<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import { PersonnelImportPage } from '$features/personnel';

	let { data } = $props();

	const org = getAppShellContext();
</script>

{#await data.personnel.data}
	<div class="px-6 py-8">
		<div class="h-8 w-48 animate-pulse rounded bg-muted"></div>
		<div class="mt-6 h-80 animate-pulse rounded border bg-muted/40"></div>
	</div>
{:then personnelWorkspace}
	<PersonnelImportPage
		orgId={org.orgId}
		orgUrlSegment={org.orgUrlSegment ?? org.orgId}
		groups={personnelWorkspace.data.groups}
		rankCatalog={personnelWorkspace.data.rankCatalog}
		personnel={personnelWorkspace.data.personnel}
	/>
{:catch}
	<!-- The Personnel layout observes this same source and shows WorkspaceLoadError. -->
{/await}
