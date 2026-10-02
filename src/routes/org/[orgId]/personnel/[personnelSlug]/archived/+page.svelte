<script lang="ts">
	import { PersonnelArchivedArtifactsPageView } from '$features/personnel';
	import type { PersonnelArchivedArtifactsPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelArchivedArtifactsPageData } = $props();
</script>

{#key `${data.orgId}:${data.personnelId}`}
	<PersonnelArchivedArtifactsPageView {data} />
{/key}
