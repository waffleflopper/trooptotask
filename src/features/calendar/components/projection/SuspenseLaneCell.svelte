<script lang="ts" module>
	import type { ProjectionCardChoice } from '$features/calendar/projection/projectionCards';

	export interface SuspenseLaneDay {
		readonly dateLabel: string;
		/** Every active suspense due this day. */
		readonly markers: readonly (ProjectionCardChoice & { readonly label: string })[];
		/** The day has passed, so its suspenses are overdue. */
		readonly overdue: boolean;
	}
</script>

<script lang="ts">
	import ProjectionMarker from './ProjectionMarker.svelte';

	let { value, class: className = '' }: { value: SuspenseLaneDay; class?: string } = $props();

	const first = $derived(value.markers[0]);
	const listLabel = $derived(
		`${value.markers.length} ${value.overdue ? 'overdue ' : ''}suspenses due ${value.dateLabel}`
	);
	const control = $derived(
		`flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className || 'size-full'}`
	);
</script>

<!-- One control a day: a header corner and a ten pixel column have room for nothing more. -->
{#snippet diamond()}
	<svg aria-hidden="true" width="9" height="9" viewBox="0 0 10 10" class="shrink-0">
		<path
			d="M5 .8L9.2 5 5 9.2.8 5z"
			stroke-width="1.2"
			class={value.overdue ? 'fill-destructive stroke-destructive' : 'fill-card stroke-foreground'}
		/>
	</svg>
{/snippet}

{#if first && value.markers.length === 1}
	<ProjectionMarker target={first.target} href={first.href} label={first.label} title={first.label} class={control}>
		{@render diamond()}
	</ProjectionMarker>
{:else if first}
	<ProjectionMarker
		label={listLabel}
		title={listLabel}
		heading={`Suspenses due ${value.dateLabel}`}
		choices={value.markers}
		class={control}
	>
		{@render diamond()}
	</ProjectionMarker>
{/if}
