<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import OverviewTabView from './OverviewTabView.svelte';

	let { data } = $props();

	const org = getAppShellContext();
</script>

<div class="px-6 py-7 lg:px-9">
	<!-- Another Person's sections must never stay on screen while this Person's reads are pending. -->
	{#key data.personnelDetailHeader.person.id}
		<OverviewTabView
			orgId={org.orgId}
			orgUrlSegment={org.orgUrlSegment}
			person={data.personnelDetailHeader.person}
			asOf={data.asOf}
			overview={data.overview}
		/>
	{/key}
</div>
