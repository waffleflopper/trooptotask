<script lang="ts">
	import { PersonnelDocumentsPageView } from '$features/personnel';
	import type { PersonnelDocumentsPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelDocumentsPageData } = $props();
</script>

{#key `${data.orgId}:${data.personnelId}`}
	<PersonnelDocumentsPageView {data} />
{/key}
