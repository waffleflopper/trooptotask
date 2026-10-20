<script lang="ts">
	import type { PageProps } from './$types';
	import { PoliciesSettingsPage, SettingsPageHeader } from '$features/organization';

	let { data }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<SettingsPageHeader
	page="policies"
	subtitle={`The clocks ${unit} runs on. Each number changes what gets flagged, graded or deleted, so the result is spelled out next to it.`}
/>

{#key data.orgId}
	<PoliciesSettingsPage orgUrlSegment={data.orgUrlSegment} policies={data.policiesSettings.sections.policies} />
{/key}
