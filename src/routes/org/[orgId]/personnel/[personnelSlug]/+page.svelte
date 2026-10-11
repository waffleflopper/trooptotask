<script lang="ts">
	import { PersonnelDetailPageView } from '$features/personnel';
	import type { PersonnelDetailHeader, PersonnelDetailStreams } from '$features/personnel/contracts';
	import type { PersonnelWorkspaceResult } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Group } from '$features/personnel/contracts';
	import { getAppShellContext } from '$features/app-shell';
	import WorkspaceLoadError from '../../WorkspaceLoadError.svelte';

	interface PersonnelLayoutData {
		personnelDetailHeader: PersonnelDetailHeader;
		personnelDetail: PersonnelDetailStreams;
		personnel: {
			data: Promise<PersonnelWorkspaceResult>;
		};
	}

	import { requestPersonnelArchiveApproval as requestArchiveApproval } from '$lib/personnelArchiveRequestDelivery';

	let { data }: { data: PersonnelLayoutData } = $props();

	class PersonnelWorkspaceGroups {
		groups = $state<Group[]>([]);
		error = $state<Error | null>(null);

		constructor(workspace: Promise<PersonnelWorkspaceResult>) {
			void workspace
				.then((personnelWorkspace) => {
					this.groups = personnelWorkspace.data.groups;
				})
				.catch((error: unknown) => {
					this.error = error instanceof Error ? error : new Error(String(error));
				});
		}
	}

	const org = getAppShellContext();
	const workspaceGroups = $derived(new PersonnelWorkspaceGroups(data.personnel.data));
	const person = $derived(data.personnelDetailHeader.person);
	const archiveResource = $derived(
		person.groupId ? { kind: 'group' as const, groupId: person.groupId } : { kind: 'organization' as const }
	);
	const archiveAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.personnel.manageRecords, archiveResource)
	);
	const canArchivePersonnel = $derived(archiveAffordance.allowed);
</script>

{#if workspaceGroups.error}
	<WorkspaceLoadError subject="Personnel" />
{:else}
	<PersonnelDetailPageView
		orgId={org.orgId}
		orgUrlSegment={org.orgUrlSegment}
		{person}
		groups={workspaceGroups.groups}
		orgName={org.orgName}
		detail={data.personnelDetail}
		{canArchivePersonnel}
		{requestArchiveApproval}
	/>
{/if}
