<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import PersonnelFilesPageView from '$features/personnel/components/PersonnelFilesPageView.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

	let { data } = $props();

	const org = getAppShellContext();
	const person = $derived(data.personnelDetailHeader.person);
	const canManage = $derived(
		org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			person.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' }
		).allowed
	);
</script>

<div class="px-6 py-8">
	<!-- Another Person's rows must never stay on screen while this Person's reads are pending. -->
	{#key person.id}
		<PersonnelFilesPageView orgId={org.orgId} personnelId={person.id} asOf={data.asOf} files={data.files} {canManage} />
	{/key}
</div>
