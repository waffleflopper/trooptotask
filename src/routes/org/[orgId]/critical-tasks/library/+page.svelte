<script lang="ts">
	import IctTaskLibraryPage from '$features/critical-tasks/components/IctTaskLibraryPage.svelte';

	let { data } = $props();
</script>

<IctTaskLibraryPage {data} />
