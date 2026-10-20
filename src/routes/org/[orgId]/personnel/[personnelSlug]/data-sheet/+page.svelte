<script lang="ts">
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import { PersonnelDataSheetPageView } from '$features/personnel';
	import type {
		PersonnelDataSheetPageData,
		PersonnelDetailHeader,
		PersonnelWorkspaceRestricted,
		PersonnelWorkspaceResult
	} from '$features/personnel/contracts';

	interface PersonnelDataSheetData extends PersonnelDataSheetPageData {
		personnelDetailHeader: PersonnelDetailHeader;
		today: string;
		personnel: { data: Promise<PersonnelWorkspaceResult | PersonnelWorkspaceRestricted> };
	}

	let { data }: { data: PersonnelDataSheetData } = $props();

	const org = getAppShellContext();
	const editing = $derived(page.url.searchParams.get('edit') === '1');
</script>

{#key data.personnelDetailHeader.person.id}
	<PersonnelDataSheetPageView
		orgId={org.orgId}
		orgUrlSegment={org.orgUrlSegment}
		person={data.personnelDetailHeader.person}
		today={data.today}
		{editing}
		dataSheet={data.dataSheet}
		workspace={data.personnel.data}
	/>
{/key}
