<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import type { FinalStep } from '../../onboardingHistory';
	import { PACKET_EYEBROW } from './layout';

	let { steps }: { steps: FinalStep[] } = $props();

	const uid = $props.id();
	const headingId = `final-packet-${uid}`;

	function detail(step: FinalStep): string | null {
		if (step.removed) return step.done ? 'Previously completed' : 'Removed from template';
		return step.stage;
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
				<span class="min-w-0 flex-1 text-sm">{step.name}</span>
				{#if detail(step)}
					<span class="font-mono text-xs text-muted-foreground">{detail(step)}</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>
