<script lang="ts">
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { getSetupStepSupport } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const canConfigure = $derived(
		support.access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary).allowed
	);
</script>

<SetupFeatureStep
	setUpHint="Build the task lists your unit signs off on, in the task library."
	laterHint="Critical tasks stays on, empty. Owners and admins see a reminder on the Dashboard until it has a task."
>
	{#snippet setUp()}
		<SetupFeaturePanel title="Task library">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
				<p class="flex-1 text-sm leading-5 text-muted-foreground">
					Add task lists and their tasks, then record sign-offs person by person.
					{#if !canConfigure}Changing the library needs Critical tasks configure access.{/if}
				</p>
				{#if canConfigure}
					<Button variant="outline" href="{flow.dashboardHref}/critical-tasks/library">Open the task library</Button>
				{/if}
			</div>
		</SetupFeaturePanel>
	{/snippet}
</SetupFeatureStep>
