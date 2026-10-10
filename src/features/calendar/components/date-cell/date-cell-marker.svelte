<script lang="ts">
	import type { DateCellMarker } from './types.js';

	interface Props {
		marker: DateCellMarker;
	}

	let { marker }: Props = $props();
</script>

<span
	data-slot="date-cell-marker"
	class="absolute right-[3px] bottom-[3px] z-[1] max-w-[calc(100%-6px)] overflow-hidden rounded-[2px] px-[3px] font-mono text-[7px] leading-[1.2] font-extrabold text-ellipsis whitespace-nowrap uppercase inset-ring inset-ring-primary-foreground/55"
	style:background-color={marker.color}
	style:color={marker.textColor}
	title={marker.title ?? marker.name}
>
	{marker.shortName}
</span>
