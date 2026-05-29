<script lang="ts">
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import PersonnelImportPage from '$features/personnel/components/PersonnelImportPage.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const workspaceData = $derived(data.personnel.data);
</script>

<PersonnelImportPage
	orgId={data.orgId}
	orgUrlSegment={org.orgUrlSegment ?? data.orgId}
	groups={workspaceData.groups}
	personnel={workspaceData.personnel}
	readOnly={org.readOnly}
/>
