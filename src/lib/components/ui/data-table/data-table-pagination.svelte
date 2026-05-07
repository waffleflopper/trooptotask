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
				disabled={table.page <= 1}
				onclick={() => table.setPage(table.page - 1)}
			>
				<ChevronLeftIcon aria-hidden="true" />
				Previous
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={table.page >= table.totalPages}
				onclick={() => table.setPage(table.page + 1)}
			>
				Next
				<ChevronRightIcon aria-hidden="true" />
			</Button>
		</div>
	</nav>
{/if}
