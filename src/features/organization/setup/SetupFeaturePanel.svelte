<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, aside, children }: { title: string; aside?: Snippet; children: Snippet } = $props();
	const id = $props.id();
</script>

<section
	class="flex flex-col gap-3.5 sm:rounded-lg sm:border sm:border-border sm:bg-muted sm:p-5"
	aria-labelledby="{id}-title"
>
	<div class="flex items-baseline gap-3">
		<h2 id="{id}-title" class="flex-1 font-heading text-lg leading-[22px] font-bold sm:text-xl sm:leading-6">
			{title}
		</h2>
		{@render aside?.()}
	</div>
	{@render children()}
</section>
