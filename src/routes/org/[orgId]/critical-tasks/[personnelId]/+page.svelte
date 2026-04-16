<script lang="ts">
	import IctPersonnelDetailPage from '$features/critical-tasks/components/IctPersonnelDetailPage.svelte';

	let { data } = $props();
</script>

<IctPersonnelDetailPage {data} />
