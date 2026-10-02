<script lang="ts">
	import type { PageProps } from './$types';
	import { DangerSettingsPage } from '$features/organization';
	let { data, form }: PageProps = $props();
</script>

{#key data.orgId}
	<DangerSettingsPage settings={data.dangerSettings} {form} />
{/key}
