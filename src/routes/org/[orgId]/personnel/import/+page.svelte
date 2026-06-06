<script lang="ts">
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { throwRenderError } from '$lib/utils/streamedRouteData';
	import PersonnelImportPage from '$features/personnel/components/PersonnelImportPage.svelte';

	let { data } = $props();

	const org = getOrgContext();
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
		personnel={personnelWorkspace.data.personnel}
		readOnly={org.readOnly}
	/>
{:catch error}
	{throwRenderError(error, 'Failed to load personnel workspace')}
{/await}
