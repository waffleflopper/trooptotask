<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { CommitmentSegment } from '$features/calendar/projection/projectionCommitments';
	import ProjectionMarker from './ProjectionMarker.svelte';

	let { segment }: { segment: CommitmentSegment } = $props();

	// A thin amber underline reads as "committed", apart from the availability fills above it. A commitment that
	// clashes with the Person's availability breaks into dashes and carries a warning mark, amber rather than red.
	const target =
		'group relative flex size-full items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none after:absolute after:inset-x-0 after:-inset-y-1 after:content-[""]';
	const rail = $derived([
		'pointer-events-none block h-1 min-w-0 flex-1',
		segment.conflicts
			? 'bg-[repeating-linear-gradient(90deg,var(--color-accent)_0_5px,transparent_5px_8px)]'
			: 'bg-accent',
		segment.kind === 'taskings' && !segment.conflicts && 'outline outline-1 outline-offset-0 outline-accent-text',
		!segment.continuesBefore && 'rounded-l-[2px]',
		!segment.continuesAfter && 'rounded-r-[2px]'
	]);
</script>

{#snippet marks()}
	<span aria-hidden="true" class={rail}></span>
	{#if segment.conflicts && !segment.continuesBefore}
		<span
			aria-hidden="true"
			data-slot="commitment-conflict"
			class="pointer-events-none absolute bottom-0 left-0 flex size-3 items-center justify-center rounded-full bg-card text-accent-text ring-1 ring-accent"
		>
			<TriangleAlert class="size-2" strokeWidth={2.5} />
		</span>
	{/if}
{/snippet}

{#if segment.kind === 'tasking'}
	<ProjectionMarker
		target={segment.target}
		href={segment.href}
		label={segment.label}
		title={segment.label}
		class={target}
	>
		{@render marks()}
	</ProjectionMarker>
{:else}
	<ProjectionMarker
		label={segment.label}
		title={segment.label}
		heading={segment.heading}
		choices={segment.choices}
		class={target}
	>
		{@render marks()}
	</ProjectionMarker>
{/if}
