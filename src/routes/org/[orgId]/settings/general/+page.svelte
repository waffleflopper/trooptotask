<script lang="ts">
	import type { PageProps } from './$types';
	import GeneralSettingsPage from '../GeneralSettingsPage.svelte';

	let { data, form }: PageProps = $props();
</script>

<GeneralSettingsPage {data} {form} />
