<script lang="ts">
	import { getAppShellContext } from '$features/app-shell';
	import ReadinessTabView from './ReadinessTabView.svelte';

	let { data } = $props();

	const org = getAppShellContext();
</script>

<div class="px-6 py-8">
	<ReadinessTabView
		orgId={org.orgId}
		person={data.personnelDetailHeader.person}
		readiness={data.readiness}
		asOf={data.asOf}
	/>
</div>
