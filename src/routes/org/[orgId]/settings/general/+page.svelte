<script lang="ts">
	import type { PageProps } from './$types';
	import { GeneralSettingsPage } from '$features/organization';

	let { data, form }: PageProps = $props();
</script>

{#key data.orgId}
	<GeneralSettingsPage {data} {form} />
{/key}
