<script lang="ts">
	import IctPersonnelHistoryPage from '$features/critical-tasks/components/IctPersonnelHistoryPage.svelte';

	let { data } = $props();
</script>

<IctPersonnelHistoryPage {data} />
