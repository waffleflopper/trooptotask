<script lang="ts">
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { FEATURE_ROWS } from '../featuresSettings';
	import { getSetupStepSupport } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const description = FEATURE_ROWS.find((row) => row.key === 'eventsAndTaskings')!.description;
	const canManage = $derived(
		support.access.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents).allowed
	);
</script>

<SetupFeatureStep
	setUpHint="Add the events your unit runs or supports, and the taskings that staff them."
	laterHint="Events & Taskings stays on, empty. Come back to this step any time."
>
	{#snippet setUp()}
		<SetupFeaturePanel title="Events & Taskings">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
				<p class="flex-1 text-sm leading-5 text-muted-foreground">
					{description}
					{#if !canManage}Adding events needs Calendar operate access.{/if}
				</p>
				{#if canManage}
					<div class="flex shrink-0 gap-2">
						<Button variant="outline" href="{flow.dashboardHref}/calendar/events">Open Events</Button>
						<Button variant="outline" href="{flow.dashboardHref}/calendar/taskings">Open Taskings</Button>
					</div>
				{/if}
			</div>
		</SetupFeaturePanel>
	{/snippet}
</SetupFeatureStep>
