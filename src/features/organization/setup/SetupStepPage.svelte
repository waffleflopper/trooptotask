<script lang="ts">
	import type { Component } from 'svelte';
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { SetupStepKey } from './registry';
	import SetupInviteStep from './SetupInviteStep.svelte';
	import SetupStepFooter from './SetupStepFooter.svelte';
	import { SETUP_FACT_LABELS, SETUP_GROUP_LABELS, getSetupFlow } from './setupFlow.svelte';

	/** A step's body renders its editor and its own `SetupStepFooter`. Steps without one show a placeholder. */
	const bodies: Partial<Record<SetupStepKey, Component>> = {
		invite: SetupInviteStep
	};

	const flow = getSetupFlow();
	const step = $derived(flow.current);
	const Body = $derived(step ? bodies[step.key] : undefined);
</script>

{#if step}
	<div class="flex max-w-190 flex-col gap-2.5">
		<p
			class="hidden font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase lg:block"
		>
			Step {flow.position + 1} of {flow.rail.length} · {SETUP_GROUP_LABELS[step.group]}
		</p>
		<h1 class="font-heading text-[40px] leading-10 font-extrabold uppercase lg:text-5xl lg:leading-12">
			{step.title}
		</h1>
		<p class="text-base leading-6">{step.pitch}</p>
	</div>
	{#if step.loadErrors.length}
		<Alert.Root variant="destructive">
			<Alert.Title>
				{step.loadErrors.map(({ source }) => SETUP_FACT_LABELS[source]).join(' and ')} could not be loaded
			</Alert.Title>
			<Alert.Description>
				This step's status may be out of date. Every other step still works.
				<Button variant="outline" size="sm" class="mt-2" onclick={() => invalidate('app:organization-setup')}>
					Retry
				</Button>
			</Alert.Description>
		</Alert.Root>
	{/if}
	{#key step.key}
		{#if Body}
			<Body />
		{:else}
			<p class="text-sm leading-5 text-muted-foreground">This step's editor arrives in a later update.</p>
			<SetupStepFooter />
		{/if}
	{/key}
{/if}
