<script lang="ts">
	import GeneralSettingsPage from './GeneralSettingsPage.svelte';

	let { data, form } = $props();
</script>

<GeneralSettingsPage {data} {form} />
