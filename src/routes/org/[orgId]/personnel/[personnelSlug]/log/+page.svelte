<script lang="ts">
	import { PersonnelFollowUpsPageView, PersonnelNotesPageView } from '$features/personnel';
	import type { PersonnelLogPageData } from '$features/personnel/contracts';

	let { data }: { data: PersonnelLogPageData } = $props();
</script>

{#key `${data.followUps.orgId}:${data.followUps.personnelId}`}
	<PersonnelFollowUpsPageView data={data.followUps} />
	<PersonnelNotesPageView data={data.notes} />
{/key}
