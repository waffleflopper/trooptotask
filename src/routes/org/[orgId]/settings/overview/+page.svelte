<script lang="ts">
	import type { PageProps } from './$types';
	import { SettingsOverviewPage, SettingsPageHeader } from '$features/organization';

	let { data }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
	const sources = $derived({ ...data.settingsNavCounts, ...data.settingsOverview });
</script>

<SettingsPageHeader
	page="overview"
	subtitle={`What needs an owner or admin in ${unit}, and where to fix it. Each check reads the unit as it is now.`}
/>

{#key data.orgId}
	<SettingsOverviewPage orgUrlSegment={data.orgUrlSegment} {sources} />
{/key}
