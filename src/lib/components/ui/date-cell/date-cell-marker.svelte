<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { DateCellDensity, DateCellMarker } from './types.js';

	interface Props {
		marker: DateCellMarker;
		density?: DateCellDensity;
	}

	let { marker, density = 'month' }: Props = $props();
</script>

<span
	data-slot="date-cell-marker"
	data-density={density}
	class={cn(
		'assignment-badge absolute right-[3px] bottom-[3px] z-[1] max-w-[calc(100%-6px)] overflow-hidden rounded-[2px] px-[3px] font-mono text-[7px] leading-[1.2] font-extrabold text-ellipsis whitespace-nowrap uppercase shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary-foreground)_55%,transparent)] data-[density=long-range]:right-0 data-[density=long-range]:bottom-0 data-[density=long-range]:left-0 data-[density=long-range]:h-[3px] data-[density=long-range]:p-0 data-[density=long-range]:text-[0px]',
		marker.kind === 'duty' && 'duty-badge'
	)}
	style:background-color={marker.color}
	style:color={marker.textColor}
	title={marker.title ?? marker.name}
>
	{marker.shortName}
</span>
