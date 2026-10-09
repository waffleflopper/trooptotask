<script lang="ts" generics="T">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button/index.js';
	import { tick } from 'svelte';
	import type { DataTableState } from './types.js';

	type Props = {
		table: DataTableState<T>;
		label?: string;
	};

	let { table, label = 'Table pagination' }: Props = $props();

	let previous = $state<HTMLElement | null>(null);
	let next = $state<HTMLElement | null>(null);

	// The pressed button disables at either end of the range; hand focus to the other one instead of the page.
	async function goTo(page: number, from: HTMLElement | null, other: HTMLElement | null) {
		const hadFocus = document.activeElement === from;
		table.setPage(page);
		if (!hadFocus || (page > 1 && page < table.totalPages)) return;
		await tick();
		other?.focus();
	}
</script>

{#if table.pageSize > 0 && table.totalPages > 1}
	<nav
		aria-label={label}
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
				onclick={() => goTo(table.page - 1, previous, next)}
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
				onclick={() => goTo(table.page + 1, next, previous)}
			>
				Next
				<ChevronRightIcon aria-hidden="true" />
			</Button>
		</div>
	</nav>
{/if}
