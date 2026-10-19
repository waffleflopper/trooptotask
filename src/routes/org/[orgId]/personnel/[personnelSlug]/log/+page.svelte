<script lang="ts">
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import { PersonnelLogPageView } from '$features/personnel';
	import type { PersonnelDetailHeader, PersonnelLogPageData } from '$features/personnel/contracts';

	interface PersonnelLogData extends PersonnelLogPageData {
		personnelDetailHeader: PersonnelDetailHeader;
		today: string;
	}

	let { data }: { data: PersonnelLogData } = $props();

	const org = getAppShellContext();
</script>

{#key data.personnelDetailHeader.person.id}
	<PersonnelLogPageView
		orgId={org.orgId}
		person={data.personnelDetailHeader.person}
		today={data.today}
		data={{ followUps: data.followUps, notes: data.notes }}
		addIntent={page.url.searchParams.get('add')}
	/>
{/key}
