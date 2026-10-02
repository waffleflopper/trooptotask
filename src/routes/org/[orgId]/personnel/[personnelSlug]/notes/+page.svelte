<script lang="ts">
	import { PersonnelNotesPageView } from '$features/personnel';
	import type { PersonnelNotesPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelNotesPageData } = $props();
</script>

{#key `${data.orgId}:${data.personnelId}`}
	<PersonnelNotesPageView {data} />
{/key}
