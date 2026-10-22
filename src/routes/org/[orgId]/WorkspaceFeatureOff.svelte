<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import { FEATURE_SWITCHES, featureOffMessage, type FeatureKey } from '$lib/access/featureSwitches';

	let {
		feature,
		dashboardHref,
		settingsHref
	}: { feature: FeatureKey; dashboardHref: string; settingsHref: string | null } = $props();
	const label = $derived(FEATURE_SWITCHES[feature].label);
</script>

<svelte:head>
	<title>{label} is off - Troop to Task</title>
</svelte:head>

<Empty.Root role="status" class="m-4 w-auto min-h-80 border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
	<Empty.Header>
		<h1 class="text-xl font-semibold tracking-tight">{label} is off</h1>
		<Empty.Description>{featureOffMessage(feature)}</Empty.Description>
	</Empty.Header>
	<Empty.Content class="flex-row flex-wrap justify-center">
		<Button href={dashboardHref}>Back to Dashboard</Button>
		{#if settingsHref}
			<Button href={settingsHref} variant="outline">Manage features</Button>
		{/if}
	</Empty.Content>
</Empty.Root>
