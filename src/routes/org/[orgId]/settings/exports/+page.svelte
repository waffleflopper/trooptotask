<script lang="ts">
	import { SettingsPageHeader } from '$features/organization';
	import type { PageProps } from './$types';
	import { SettingsDataExportWorkspace } from '$features/data-export/index.web';

	let { data }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<SettingsPageHeader
	page="exports"
	subtitle={`Take ${unit}’s data with you. JSON for backups and other systems, Excel for people to read.`}
/>

{#key data.orgId}
	<SettingsDataExportWorkspace orgId={data.orgId} />
{/key}
