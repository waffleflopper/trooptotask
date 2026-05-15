<script lang="ts">
	import PersonnelDetailPageView from '$features/personnel/components/PersonnelDetailPageView.svelte';
	import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
	import type { Personnel } from '$lib/types';

	interface PersonnelLayoutData {
		orgId: string;
		orgName: string;
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetail: PersonnelDetailStreams;
		personnel?: {
			data?: {
				personnel?: Personnel[];
			};
		};
	}

	let { data }: { data: PersonnelLayoutData } = $props();

	const roster = $derived(data.personnel?.data?.personnel ?? []);
	const person = $derived(data.personnelDetailHeader.person);
</script>

<PersonnelDetailPageView orgId={data.orgId} {person} {roster} orgName={data.orgName} detail={data.personnelDetail} />
