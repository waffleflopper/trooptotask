<script lang="ts">
	import PersonnelDetailPageView from '$features/personnel/components/PersonnelDetailPageView.svelte';
	import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Group } from '$lib/stores/groups.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import type { Personnel } from '$lib/types';

	interface PersonnelLayoutData {
		orgId: string;
		orgName: string;
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetail: PersonnelDetailStreams;
		personnel?: {
			data?: {
				personnel?: Personnel[];
				groups?: Group[];
			};
		};
	}

	let { data }: { data: PersonnelLayoutData } = $props();

	const org = getOrgContext();
	const roster = $derived(data.personnel?.data?.personnel ?? []);
	const groups = $derived(data.personnel?.data?.groups ?? []);
	const person = $derived(data.personnelDetailHeader.person);
	const archiveResource = $derived(
		person.groupId ? { kind: 'group' as const, groupId: person.groupId } : { kind: 'organization' as const }
	);
	const archiveAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageRecords, archiveResource)
	);
	const canArchivePersonnel = $derived(
		archiveAffordance.allowed ||
			(archiveAffordance.reason === 'denied:read-only-overlay' &&
				org.hasCapability('personnel', 'operate') &&
				org.isResourceInScope(archiveResource))
	);
</script>

<PersonnelDetailPageView
	orgId={data.orgId}
	orgUrlSegment={org.orgUrlSegment}
	{person}
	{roster}
	{groups}
	orgName={data.orgName}
	detail={data.personnelDetail}
	{canArchivePersonnel}
/>
