<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import ReadinessTabView from './ReadinessTabView.svelte';

	let { data } = $props();

	const org = getAppShellContext();
</script>

<div class="px-6 py-8">
	<!-- Another Person's rows must never stay on screen while this Person's reads are pending. -->
	{#key data.personnelDetailHeader.person.id}
		<ReadinessTabView
			orgId={org.orgId}
			person={data.personnelDetailHeader.person}
			readiness={data.readiness}
			asOf={data.asOf}
		/>
	{/key}
</div>
