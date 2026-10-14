<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import type { FinalStep } from '../../onboardingHistory';
	import { PACKET_EYEBROW } from './layout';

	let { steps }: { steps: FinalStep[] } = $props();

	const uid = $props.id();
	const headingId = `final-packet-${uid}`;

	function removal(step: FinalStep): string | null {
		if (!step.removed) return null;
		return step.done ? 'Previously completed' : 'Removed from template';
	}
</script>

<section data-slot="onboarding-packet-steps" class="grid min-w-0 flex-1 content-start gap-2.5">
	<h4 id={headingId} class={PACKET_EYEBROW}>Final packet · read only</h4>
	<ul aria-labelledby={headingId} class="md:columns-2 md:gap-8">
		{#each steps as step (step.id)}
			<li
				class={[
					'flex break-inside-avoid items-center gap-2.5 border-b border-border py-2',
					step.removed && 'text-muted-foreground'
				]}
			>
				{#if step.done}
					<Check aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
				{:else}
					<Circle aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground/60" />
				{/if}
				<span class="sr-only">{step.done ? 'Done:' : 'Open:'}</span>
				<span class="grid min-w-0 flex-1 gap-0.5">
					<span class="text-sm wrap-anywhere">{step.name}</span>
					{#if removal(step)}
						<span class="text-xs">{removal(step)}</span>
					{/if}
				</span>
				{#if step.stage}
					<span class="max-w-2/5 shrink-0 text-right font-mono text-xs wrap-anywhere text-muted-foreground"
						>{step.stage}</span
					>
				{/if}
			</li>
		{/each}
	</ul>
</section>
