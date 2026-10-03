<script lang="ts">
	import type { PageProps } from './$types';
	import SettingsDataExportWorkspace from './SettingsDataExportWorkspace.svelte';

	let { data }: PageProps = $props();
</script>

{#key data.orgId}
	<SettingsDataExportWorkspace orgId={data.orgId} />
{/key}
