<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLButtonAttributes, 'children'> & {
		weekend?: boolean;
		today?: boolean;
		holiday?: boolean;
		onboarding?: boolean;
	};

	let {
		weekend = false,
		today = false,
		holiday = false,
		onboarding = false,
		class: className,
		title,
		type = 'button',
		...restProps
	}: Props = $props();
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
		className
	)}
	{type}
	{title}
	{...restProps}
></button>
