<script lang="ts">
	import { page } from '$app/state';
	import {
		ACCESS_LANE_LABELS,
		CAPABILITY_LEVEL_LABELS,
		type CapabilityLevel,
		type DurableFeatureLane
	} from '$lib/access/memberAccessShape';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';

	let { lane, level }: { lane: DurableFeatureLane; level: Exclude<CapabilityLevel, 'none'> } = $props();

	const org = $derived(page.data.shell.org);
	const needed = $derived(`${ACCESS_LANE_LABELS[lane]} ${CAPABILITY_LEVEL_LABELS[level]}`);
</script>

<svelte:head>
	<title>Access Restricted - Troop to Task</title>
</svelte:head>

<Empty.Root role="alert" class="m-4 min-h-80 w-auto border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
	<Empty.Header>
		<h1 class="text-xl font-semibold tracking-tight">Access Restricted</h1>
		<Empty.Description>
			You need {needed} access to open this page. An owner or admin of {org.name} can grant it.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button href="/org/{org.urlSegment}">Back to {org.name} home</Button>
	</Empty.Content>
</Empty.Root>
