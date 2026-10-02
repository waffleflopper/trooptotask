<script lang="ts">
	import { PersonnelCounselingsPageView } from '$features/personnel';
	import type { PersonnelCounselingsPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelCounselingsPageData } = $props();
</script>

{#key `${data.orgId}:${data.personnelId}`}
	<PersonnelCounselingsPageView {data} />
{/key}
