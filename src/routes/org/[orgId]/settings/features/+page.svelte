<script lang="ts">
	import type { PageProps } from './$types';
	import { FeaturesSettingsPage, SettingsPageHeader } from '$features/organization';

	let { data }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
</script>

<SettingsPageHeader
	page="features"
	subtitle={`Turn off anything ${unit} doesn't track. A feature that's off leaves the sidebar and the dashboard for everyone. Its records are kept, and it comes back exactly as it was.`}
/>

{#key data.orgId}
	<FeaturesSettingsPage orgUrlSegment={data.orgUrlSegment} unitName={unit} features={data.featuresSettings} />
{/key}
