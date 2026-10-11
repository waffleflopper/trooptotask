<script lang="ts" module>
	const ROW = '[data-slot="type-management-workspace-list-item"]';
	const CONTROL = 'button, a[href], input, select, textarea, [tabindex]';

	function rowsOf(grid: HTMLElement) {
		return [...grid.querySelectorAll<HTMLElement>(ROW)];
	}

	function controlsOf(row: HTMLElement) {
		return [...row.querySelectorAll<HTMLElement>(CONTROL)];
	}

	function selectedRow(grid: HTMLElement) {
		const rows = rowsOf(grid);
		return rows.find((row) => row.getAttribute('aria-selected') === 'true') ?? rows[0];
	}

	// One Tab stop: the selected row, or the first row. Row actions are reached with ArrowRight.
	function rovingTabStop(grid: HTMLElement) {
		const sync = () => {
			const stop = selectedRow(grid);
			for (const row of rowsOf(grid)) {
				row.tabIndex = row === stop ? 0 : -1;
				for (const control of controlsOf(row)) control.tabIndex = -1;
			}
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(grid, { subtree: true, childList: true, attributeFilter: ['aria-selected'] });
		return () => observer.disconnect();
	}
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

	export function focusSelected() {
		if (ref) selectedRow(ref)?.focus();
	}

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		const row = target.closest<HTMLElement>(ROW);
		if (!ref || !row) return;
		const rows = rowsOf(ref);
		const index = rows.indexOf(row);
		const stops = [row, ...controlsOf(row).filter((control) => !control.matches(':disabled'))];
		const position = stops.indexOf(target);
		const moves: Record<string, HTMLElement | undefined> = {
			ArrowDown: rows[index + 1],
			ArrowUp: rows[index - 1],
			Home: rows[0],
			End: rows.at(-1),
			ArrowRight: stops[position + 1],
			ArrowLeft: position > 0 ? stops[position - 1] : undefined
		};
		if (!(event.key in moves)) return;
		event.preventDefault();
		moves[event.key]?.focus();
	}
</script>

<div
	bind:this={ref}
	role="grid"
	data-slot="type-management-workspace-item-list"
	class={cn('overflow-hidden rounded-md border border-border bg-card', className)}
	{onkeydown}
	{@attach rovingTabStop}
	{...restProps}
>
	{@render children?.()}
</div>
