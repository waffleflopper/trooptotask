<script lang="ts">
	import PersonnelDetailPageView from '$features/personnel/components/PersonnelDetailPageView.svelte';
	import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
	import type { PersonnelWorkspaceResult } from '$features/personnel/server/personnelWorkspaceBootstrap';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Group } from '$lib/stores/groups.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { throwRenderError } from '$lib/utils/streamedRouteData';

	interface PersonnelLayoutData {
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetail: PersonnelDetailStreams;
		personnel: {
			data: Promise<PersonnelWorkspaceResult>;
		};
	}

	let { data }: { data: PersonnelLayoutData } = $props();

	const org = getOrgContext();
	const pendingGroups: Group[] = [];
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

{#await data.personnel.data}
	<PersonnelDetailPageView
		orgId={org.orgId}
		orgUrlSegment={org.orgUrlSegment}
		{person}
		groups={pendingGroups}
		orgName={org.orgName}
		detail={data.personnelDetail}
		{canArchivePersonnel}
	/>
{:then personnelWorkspace}
	<PersonnelDetailPageView
		orgId={org.orgId}
		orgUrlSegment={org.orgUrlSegment}
		{person}
		groups={personnelWorkspace.data.groups}
		orgName={org.orgName}
		detail={data.personnelDetail}
		{canArchivePersonnel}
	/>
{:catch error}
	{throwRenderError(error, 'Failed to load personnel workspace')}
{/await}
