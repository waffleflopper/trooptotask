<script lang="ts">
	import { page } from '$app/state';
	import type { PageProps } from './$types';
	import type { SettingsNavCounts } from '$features/organization/contracts';
	import { SettingsOverviewPage, SettingsPageHeader } from '$features/organization';

	let { data }: PageProps = $props();

	const unit = $derived(data.orgName ?? 'the unit');
	// The layout streams these; PageData does not carry its keys because the page's suspended branch is an open record.
	const navCounts = $derived(page.data.settingsNavCounts as SettingsNavCounts | undefined);
	// The layout redirects a suspended Organization, so its counts are always here when this page renders.
	const sources = $derived(navCounts && { ...navCounts, ...data.settingsOverview });
</script>

<SettingsPageHeader
	page="overview"
	subtitle={`What needs an owner or admin in ${unit}, and where to fix it. Each check reads the unit as it is now.`}
/>

{#key data.orgId}
	{#if sources}
		<SettingsOverviewPage orgUrlSegment={data.orgUrlSegment} {sources} />
	{/if}
{/key}
