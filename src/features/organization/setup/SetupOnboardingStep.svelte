<script lang="ts">
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { getSetupStepSupport } from './featureStepSupport';
	import SetupFeaturePanel from './SetupFeaturePanel.svelte';
	import SetupFeatureStep from './SetupFeatureStep.svelte';
	import { getSetupFlow } from './setupFlow.svelte';

	const flow = getSetupFlow();
	const support = getSetupStepSupport();
	const allowed = (action: Parameters<typeof support.access.affordanceForFeatureAction>[0]) =>
		support.access.affordanceForFeatureAction(action).allowed;
	const canConfigure = $derived(allowed(POLICY_ACTION_CATALOG.onboarding.configureWorkflows));
	// The pack also creates training types, so it needs Training on and configurable too.
	const canApplyPack = $derived(
		canConfigure && !flow.isFeatureOff('training') && allowed(POLICY_ACTION_CATALOG.training.configureRequirements)
	);
	let applyPack = $state(false);

	async function save() {
		const result = await flow.applyFirstWeekOperations();
		if (!result) return;
		if (result.failed.length > 0) {
			throw new Error(`${result.failed.map((item) => item.name).join(', ')} could not be added. Try again.`);
		}
	}

	const footer = $derived(
		canApplyPack && applyPack
			? { save, continueLabel: 'Add First Week Operations and continue', note: 'Adds a template and 2 training types' }
			: {}
	);
</script>

<SetupFeatureStep
	setUpHint="Give new arrivals a checklist. Start from the First Week Operations pack."
	laterHint="Onboarding stays on, empty. Owners and admins see a reminder on the Dashboard until it has a template."
	{footer}
>
	{#snippet setUp()}
		<SetupFeaturePanel title="Onboarding templates">
			{#if canApplyPack}
				<label class="flex cursor-pointer gap-2.5 border-b border-border pb-3.5">
					<Checkbox class="mt-0.5" bind:checked={applyPack} />
					<span class="flex min-w-0 flex-col gap-0.5">
						<span class="text-sm leading-5 font-semibold">First Week Operations</span>
						<span class="text-sm leading-5 text-muted-foreground">
							A New Arrival Packet template with four steps, plus the Unit Orientation and Required Annual Training
							types. Anything your unit already has is kept.
						</span>
					</span>
				</label>
			{/if}
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
				<p class="flex-1 text-sm leading-5 text-muted-foreground">
					A template is the checklist each new arrival's packet starts from.
					{#if !canConfigure}Changing templates needs Onboarding configure access.{/if}
				</p>
				{#if canConfigure}
					<Button variant="outline" href="{flow.dashboardHref}/onboarding/templates">Open templates</Button>
				{/if}
			</div>
		</SetupFeaturePanel>
	{/snippet}
</SetupFeatureStep>
