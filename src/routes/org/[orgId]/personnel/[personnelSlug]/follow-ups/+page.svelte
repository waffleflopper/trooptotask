<script lang="ts">
	import { PersonnelFollowUpsPageView } from '$features/personnel';
	import type { PersonnelFollowUpsPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelFollowUpsPageData } = $props();
</script>

{#key `${data.orgId}:${data.personnelId}`}
	<PersonnelFollowUpsPageView {data} />
{/key}
