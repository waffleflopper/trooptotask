<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import Fill from './date-cell-fill.svelte';
	import Marker from './date-cell-marker.svelte';
	import type { DateCellDensity, DateCellMarker, DateCellStatus } from './types.js';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		statuses?: DateCellStatus[];
		markers?: DateCellMarker[];
		weekend?: boolean;
		today?: boolean;
		holiday?: boolean;
		holidayName?: string;
		onboarding?: boolean;
		showStatusText?: boolean;
		density?: DateCellDensity;
		children?: Snippet;
	};

	let {
		statuses = [],
		markers = [],
		weekend = false,
		today = false,
		holiday = false,
		holidayName,
		onboarding = false,
		showStatusText = false,
		density = 'month',
		children,
		class: className,
		title,
		type = 'button',
		...restProps
	}: Props = $props();

	const computedTitle = $derived.by(() => {
		if (title) return title;

		const parts: string[] = [];
		if (holidayName) parts.push(holidayName);
		parts.push(...markers.map((marker) => marker.title ?? marker.name));
		parts.push(...statuses.map((status) => (status.note ? `${status.name} - ${status.note}` : status.name)));
		return parts.join('\n');
	});
</script>

<button
	data-slot="date-cell"
	data-density={density}
	class={cn(
		'bg-card relative block h-full min-h-9 w-full min-w-0 cursor-pointer overflow-hidden border-r border-b text-left transition-[background-color,box-shadow,filter] hover:bg-primary/5 focus-visible:ring-ring focus-visible:z-[2] focus-visible:ring-2 focus-visible:outline-none max-sm:min-w-[var(--calendar-cell-width)]',
		'date-cell',
		weekend && 'bg-muted',
		holiday && 'bg-warning-muted',
		onboarding && 'bg-accent/10',
		today && 'z-[1] shadow-[inset_0_0_0_1px_var(--foreground)]',
		statuses.length > 0 && 'hover:brightness-95',
		markers.length > 0 && 'shadow-[inset_0_0_0_1px_var(--foreground)]',
		className
	)}
	{type}
	title={computedTitle}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else}
		<Fill {statuses} {showStatusText} {density} />
		{#each markers as marker (marker.id)}
			<Marker {marker} {density} />
		{/each}
	{/if}
</button>
