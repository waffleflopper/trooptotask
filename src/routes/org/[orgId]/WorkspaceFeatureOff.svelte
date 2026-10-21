<script lang="ts">
	import * as Empty from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';

	let { feature, unitName, settingsHref }: { feature: string; unitName: string; settingsHref: string | null } =
		$props();
</script>

<svelte:head>
	<title>{feature} is off - Troop to Task</title>
</svelte:head>

<Empty.Root role="status" class="m-4 w-auto min-h-80 border bg-card p-6 text-card-foreground sm:m-6 sm:p-8">
	<Empty.Header>
		<h1 class="text-xl font-semibold tracking-tight">{feature} is off for {unitName}.</h1>
	</Empty.Header>
	{#if settingsHref}
		<Empty.Content>
			<Button href={settingsHref} variant="outline">Manage features</Button>
		</Empty.Content>
	{/if}
</Empty.Root>
