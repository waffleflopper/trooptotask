<script lang="ts">
	import type { DateCellDensity, DateCellStatus } from './types.js';

	interface Props {
		statuses?: DateCellStatus[];
		showStatusText?: boolean;
		density?: DateCellDensity;
	}

	let { statuses = [], showStatusText = false, density = 'month' }: Props = $props();

	const hasStatus = $derived(statuses.length > 0);
	const firstStatus = $derived(statuses[0]);
	const label = $derived(
		showStatusText
			? statuses.map((status) => status.name).join(', ')
			: (firstStatus?.shortName ?? firstStatus?.name ?? '')
	);
	const background = $derived.by(() => {
		if (statuses.length === 0) return '';
		if (statuses.length === 1) return statuses[0].color;

		const stripeWidth = 100 / statuses.length;
		const gradientStops = statuses
			.map((status, index) => {
				const start = index * stripeWidth;
				const end = (index + 1) * stripeWidth;
				return `${status.color} ${start}%, ${status.color} ${end}%`;
			})
			.join(', ');

		return `repeating-linear-gradient(45deg, ${gradientStops})`;
	});
</script>

<span
	data-slot="date-cell-fill"
	data-density={density}
	class="absolute inset-0 flex items-start justify-start overflow-hidden p-[3px] font-mono text-[7px] leading-none font-extrabold tracking-[0.05em] whitespace-nowrap uppercase data-[density=long-range]:p-0 data-[density=long-range]:text-[0px]"
	style:background
	style:color={firstStatus?.textColor}
>
	{#if hasStatus}
		{label}
	{/if}
</span>

{#if statuses.length > 1}
	<span
		data-slot="date-cell-status-count"
		class="bg-foreground/80 text-background absolute right-px bottom-px rounded-[2px] px-0.5 font-mono text-[8px] leading-tight sm:text-[9px]"
	>
		{statuses.length}
	</span>
{/if}
