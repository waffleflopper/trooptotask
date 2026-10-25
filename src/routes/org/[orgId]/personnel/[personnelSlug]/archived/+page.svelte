<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import PersonnelArchivedPageView from '$features/personnel/components/PersonnelArchivedPageView.svelte';
	import type { PersonnelArchivedPageData, PersonnelDetailHeader } from '$features/personnel/contracts';

	interface PersonnelArchivedData extends PersonnelArchivedPageData {
		personnelDetailHeader: PersonnelDetailHeader;
	}

	let { data }: { data: PersonnelArchivedData } = $props();

	const org = getAppShellContext();
</script>

{#key data.personnelDetailHeader.person.id}
	<PersonnelArchivedPageView
		orgId={org.orgId}
		personnelId={data.personnelDetailHeader.person.id}
		data={{ archived: data.archived }}
	/>
{/key}
