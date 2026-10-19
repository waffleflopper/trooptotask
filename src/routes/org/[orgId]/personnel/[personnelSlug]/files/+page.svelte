<script lang="ts">
	import { PersonnelCounselingsPageView, PersonnelDocumentsPageView } from '$features/personnel';
	import type { PersonnelFilesPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelFilesPageData } = $props();
</script>

{#key `${data.counselings.orgId}:${data.counselings.personnelId}`}
	<PersonnelCounselingsPageView data={data.counselings} />
	<PersonnelDocumentsPageView data={data.documents} />
{/key}
