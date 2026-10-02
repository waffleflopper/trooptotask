<script lang="ts">
	import type { PageProps } from './$types';
	import PoliciesSettingsPage from './PoliciesSettingsPage.svelte';

	let { data }: PageProps = $props();
</script>

{#key data.orgId}
	<PoliciesSettingsPage orgUrlSegment={data.orgUrlSegment} policies={data.policiesSettings.sections.policies} />
{/key}
