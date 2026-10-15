<script lang="ts">
	import type { DateCellMarker } from './types.js';

	interface Props {
		marker: Pick<DateCellMarker, 'shortName' | 'color'>;
		label: string;
		onclick?: () => void;
	}

	let { marker, label, onclick }: Props = $props();

	const chip =
		'max-w-full overflow-hidden rounded-[2px] border bg-card px-[3px] font-mono text-[8px] leading-[1.3] font-extrabold text-ellipsis whitespace-nowrap uppercase';
</script>

{#if onclick}
	<button
		type="button"
		data-slot="date-cell-marker"
		class={[
			chip,
			'pointer-events-auto cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
		]}
		style:border-color={marker.color}
		style:color={marker.color}
		aria-label={label}
		title={label}
		{onclick}>{marker.shortName}</button
	>
{:else}
	<span
		data-slot="date-cell-marker"
		class={chip}
		style:border-color={marker.color}
		style:color={marker.color}
		title={label}
		aria-hidden="true">{marker.shortName}</span
	>
{/if}
