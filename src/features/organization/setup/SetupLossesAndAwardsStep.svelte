<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { FEATURE_ROWS, lossWindowHolds } from '../featuresSettings';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const description = FEATURE_ROWS.find((row) => row.key === 'lossesAndAwards')!.description;
	const lossWindow = $derived(flow.facts?.lossWarningWindowDays ?? null);
</script>

<SetupFeatureStep
	setUpHint="Keep loss warnings and end-of-tour awards in view. There is nothing to add."
	laterHint="Losses and awards stays on. Come back to this step any time."
>
	{#snippet setUp()}
		<SetupFeaturePanel title="Losses and awards">
			<p class="text-sm leading-5 text-muted-foreground">{description}</p>
			<p class="font-mono text-xs leading-4 text-muted-foreground">
				{#if lossWindow === null}
					<Skeleton class="inline-block h-3.5 w-28 align-middle" aria-hidden="true" />
					<span class="sr-only">Loading the warning window</span>
				{:else if lossWindow.status === 'ready'}
					{lossWindowHolds(lossWindow.value)} · change it in Settings › Features
				{:else}
					The warning window could not be loaded.
				{/if}
			</p>
		</SetupFeaturePanel>
	{/snippet}
</SetupFeatureStep>
