<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';

	let { page, totalPages, pageHref }: { page: number; totalPages: number; pageHref: (page: number) => string } =
		$props();

	let previous = $state<HTMLButtonElement | null>(null);
	let next = $state<HTMLButtonElement | null>(null);

	// A button that reaches the end of the range disables; hand focus to the other one instead of the page.
	async function goTo(target: number, from: HTMLButtonElement | null, other: HTMLButtonElement | null) {
		await goto(pageHref(target), { reset: false });
		if (from?.disabled && (document.activeElement === from || document.activeElement === document.body)) other?.focus();
	}
</script>

{#if totalPages > 1}
	<nav aria-label="Pagination" class="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
		<Button
			variant="outline"
			size="sm"
			bind:ref={previous}
			disabled={page <= 1}
			onclick={() => goTo(page - 1, previous, next)}
		>
			Previous
		</Button>
		<span>Page {page} of {totalPages}</span>
		<Button
			variant="outline"
			size="sm"
			bind:ref={next}
			disabled={page >= totalPages}
			onclick={() => goTo(page + 1, next, previous)}
		>
			Next
		</Button>
	</nav>
{/if}
