<script lang="ts">
	import type { PageProps } from './$types';
	import { DangerSettingsPage, SettingsPageHeader } from '$features/organization';
	let { data, form }: PageProps = $props();
</script>

<SettingsPageHeader
	page="danger"
	subtitle="Changes here can’t be undone from inside TroopToTask. Each one asks you to type a name before it runs."
/>

{#key data.orgId}
	<DangerSettingsPage settings={data.dangerSettings} {form} />
{/key}
