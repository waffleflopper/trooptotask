<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import Fill from './date-cell-fill.svelte';
	import type { DateCellMarker, DateCellStatus } from './types.js';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		statuses?: DateCellStatus[];
		markers?: DateCellMarker[];
		weekend?: boolean;
		today?: boolean;
		holiday?: boolean;
		holidayName?: string;
		onboarding?: boolean;
		showStatusText?: boolean;
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

<!-- Native button with its own classes: a month renders 651+ cells and remounts them on every navigation. The ui/button wrapper slowed load and navigation, and the shared `cell` variant classes slowed load (EVIDENCE.md, Phase 10 D03). -->
<button
	data-slot="date-cell"
	class={cn(
		'relative block h-full min-h-9 w-full min-w-0 cursor-pointer overflow-hidden border-r border-b bg-card text-left transition-[background-color,box-shadow,filter] hover:bg-primary/5 focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-w-[var(--calendar-cell-width)]',
		weekend && 'bg-muted',
		holiday && 'bg-warning-muted',
		onboarding && 'bg-accent/10',
		today && 'z-[1] inset-ring inset-ring-foreground',
		statuses.length > 0 && 'hover:brightness-95',
		className
	)}
	{type}
	title={computedTitle}
	{...restProps}
>
	<Fill {statuses} {showStatusText} />
</button>
