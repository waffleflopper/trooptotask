<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as PageShell from '$lib/components/patterns/page-shell';

	interface Props {
		/** The mono line over the title, such as "Platform · Friday 23 Oct". */
		eyebrow: string;
		title: string;
		/** One sentence on what the page holds. A snippet can hold a skeleton while its facts load. */
		description?: string | Snippet;
		/** Figures or controls at the right of the title. Hidden on a phone, as is the description. */
		aside?: Snippet;
	}

	let { eyebrow, title, description, aside }: Props = $props();
</script>

{#snippet sentence()}
	<div class="min-h-6 text-base leading-6 text-foreground max-sm:hidden">
		{#if typeof description === 'string'}{description}{:else}{@render description?.()}{/if}
	</div>
{/snippet}

{#snippet figures()}
	<div class="max-sm:hidden">{@render aside?.()}</div>
{/snippet}

<PageShell.Header
	{eyebrow}
	{title}
	variant="display"
	subtitle={description ? sentence : undefined}
	aside={aside ? figures : undefined}
/>
