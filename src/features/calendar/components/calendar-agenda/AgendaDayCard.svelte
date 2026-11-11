<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card';

	interface Props {
		today?: boolean;
		header: Snippet;
		children: Snippet;
	}

	let { today = false, header, children }: Props = $props();
</script>

<Card.Root class={['overflow-hidden', today && 'border-primary']}>
	<div class="flex min-h-10 items-center gap-2 border-b bg-muted/50 px-3 py-1.5">
		{@render header()}
	</div>
	<div class="min-h-10">
		{@render children()}
	</div>
</Card.Root>
