<script lang="ts">
	import type { CommitmentSegment } from '$features/calendar/projection/projectionCommitments';
	import MarkerListPopover from './MarkerListPopover.svelte';

	let { segment }: { segment: CommitmentSegment } = $props();

	// Hatching reads as "committed, not unavailable", apart from the solid availability fills. Overlapping picks hatch denser.
	const target =
		'group relative flex size-full items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none after:absolute after:inset-x-0 after:-inset-y-px after:content-[""]';
	const rail = $derived([
		'pointer-events-none block h-full min-w-0 flex-1 border-y border-info',
		segment.kind === 'tasking'
			? 'bg-[repeating-linear-gradient(135deg,var(--color-info)_0_2px,transparent_2px_5px)]'
			: 'bg-[repeating-linear-gradient(135deg,var(--color-info)_0_3px,transparent_3px_5px)]',
		segment.continuesBefore ? 'ml-0' : 'rounded-l-full border-l',
		segment.continuesAfter ? 'mr-0' : 'rounded-r-full border-r'
	]);
</script>

{#if segment.kind === 'tasking'}
	<a href={segment.href} class={target} aria-label={segment.label} title={segment.label}>
		<span aria-hidden="true" class={rail}></span>
	</a>
{:else}
	<MarkerListPopover label={segment.label} heading={segment.heading} items={segment.items} class={target}>
		<span aria-hidden="true" class={rail}></span>
	</MarkerListPopover>
{/if}
