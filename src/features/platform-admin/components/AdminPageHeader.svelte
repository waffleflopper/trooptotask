<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';

	interface Props {
		/** The mono line over the title, such as "Platform · Friday 23 Oct". */
		eyebrow: string;
		/** A snippet holds a skeleton while the record's own name loads. */
		title: string | Snippet;
		/** One sentence on what the page holds. A snippet can hold a skeleton while its facts load. */
		description?: string | Snippet;
		/** Figures or controls at the right, level with the description. Hidden on a phone, as is the description. */
		aside?: Snippet;
	}

	let { eyebrow, title, description, aside }: Props = $props();
</script>

{#snippet sentence()}
	<div class="min-h-6 text-base leading-6 text-foreground max-sm:hidden">
		{#if typeof description === 'string'}{description}{:else}{@render description?.()}{/if}
	</div>
{/snippet}

<div class="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
	<PageShell.Header
		{eyebrow}
		{title}
		variant="display"
		subtitle={description ? sentence : undefined}
		class="min-w-0 flex-1 basis-[34rem]"
	/>
	{#if aside}
		<div class="max-sm:hidden">{@render aside()}</div>
	{/if}
</div>
