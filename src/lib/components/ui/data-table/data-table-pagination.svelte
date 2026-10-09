<script lang="ts" generics="T">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { DataTableState } from './types.js';

	type Props = {
		table: DataTableState<T>;
		label?: string;
	};

	let { table, label = 'Table pagination' }: Props = $props();

	let previous = $state<HTMLButtonElement | null>(null);
	let next = $state<HTMLButtonElement | null>(null);
	let pressed: HTMLButtonElement | null = null;

	function goTo(page: number, from: HTMLButtonElement | null) {
		pressed = document.activeElement === from ? from : null;
		table.setPage(page);
	}

	// A pressed button disables at either end of the range, possibly only after a server page arrives.
	// Hand focus to the other button instead of letting it fall to the page.
	$effect(() => {
		void table.page;
		void table.totalPages;
		const from = pressed;
		pressed = null;
		if (!from?.disabled) return;
		if (document.activeElement === from || document.activeElement === document.body)
			(from === previous ? next : previous)?.focus();
	});

	// When the range shrinks to one page the pager disappears; keep focus in the table it belonged to.
	function keepFocusInTable(nav: HTMLElement) {
		const root = nav.closest<HTMLElement>('[data-slot="data-table"]');
		let focused = nav.contains(document.activeElement);
		// Removing the focused button may fire focusout with no destination; only a real move clears the flag.
		const track = (event: FocusEvent) => {
			if (event.type === 'focusin') focused = true;
			else if (event.relatedTarget instanceof Node) focused = nav.contains(event.relatedTarget);
		};
		nav.addEventListener('focusin', track);
		nav.addEventListener('focusout', track);
		return () => {
			nav.removeEventListener('focusin', track);
			nav.removeEventListener('focusout', track);
			if (!focused || !root) return;
			queueMicrotask(() => {
				if (!root.isConnected || (document.activeElement !== document.body && !nav.contains(document.activeElement)))
					return;
				if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
				root.focus();
			});
		};
	}
</script>

{#if table.pageSize > 0 && table.totalPages > 1}
	<nav
		aria-label={label}
		{@attach keepFocusInTable}
		data-slot="data-table-pagination"
		class="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2 text-sm"
	>
		<p class="text-muted-foreground">Page {table.page} of {table.totalPages}</p>
		<div class="flex items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				bind:ref={previous}
				disabled={table.page <= 1}
				onclick={() => goTo(table.page - 1, previous)}
			>
				<ChevronLeftIcon aria-hidden="true" />
				Previous
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				bind:ref={next}
				disabled={table.page >= table.totalPages}
				onclick={() => goTo(table.page + 1, next)}
			>
				Next
				<ChevronRightIcon aria-hidden="true" />
			</Button>
		</div>
	</nav>
{/if}
