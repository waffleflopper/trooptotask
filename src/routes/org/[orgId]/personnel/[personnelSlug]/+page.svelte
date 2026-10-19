<script lang="ts">
	import { PersonnelDetailPageView } from '$features/personnel';
	import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/contracts';
	import { getAppShellContext } from '$features/app-shell';

	interface PersonnelLayoutData {
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetail: PersonnelDetailStreams;
	}

	let { data }: { data: PersonnelLayoutData } = $props();

	const org = getAppShellContext();
	const person = $derived(data.personnelDetailHeader.person);
</script>

<PersonnelDetailPageView
	orgId={org.orgId}
	orgUrlSegment={org.orgUrlSegment}
	{person}
	orgName={org.orgName}
	detail={data.personnelDetail}
/>
