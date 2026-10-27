<script lang="ts">
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getSetupStepSupport } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const canUpdate = $derived(
		support.access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.ratingScheme.updateEntries).allowed
	);
</script>

<SetupFeatureStep
	setUpHint="Add each rated Soldier's rater and senior rater to the rating scheme."
	laterHint="Evaluations stays on, empty. Owners and admins see a reminder on the Dashboard until it has an entry."
>
	{#snippet setUp()}
		<SetupFeaturePanel title="Rating scheme">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
				<p class="flex-1 text-sm leading-5 text-muted-foreground">
					Each entry names who rates whom and when the next evaluation is due.
					{#if !canUpdate}Adding entries needs Evaluations operate access.{/if}
				</p>
				{#if canUpdate}
					<Button variant="outline" href="{flow.dashboardHref}/evals">Open the rating scheme</Button>
				{/if}
			</div>
		</SetupFeaturePanel>
	{/snippet}
</SetupFeatureStep>
