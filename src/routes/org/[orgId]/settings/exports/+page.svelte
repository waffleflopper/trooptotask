<script lang="ts">
	import type { PageProps } from './$types';
	import { SettingsDataExportWorkspace } from '$features/data-export/index.web';

	let { data }: PageProps = $props();
</script>

{#key data.orgId}
	<SettingsDataExportWorkspace orgId={data.orgId} />
{/key}
