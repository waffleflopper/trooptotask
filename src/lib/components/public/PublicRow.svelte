<script lang="ts">
	import type { Snippet } from 'svelte';
	import { monoLabel } from './layout';

	interface Props {
		id?: string;
		num: string;
		label: string;
		title: string;
		children: Snippet;
	}

	let { id, num, label, title, children }: Props = $props();
</script>

<div
	{id}
	class="grid scroll-mt-20 grid-cols-1 gap-4 border-b border-border py-8 lg:grid-cols-[minmax(200px,380px)_minmax(0,720px)] lg:gap-x-8"
>
	<div class="flex gap-4 lg:pt-1 {monoLabel}">
		<span class="text-accent-text">{num}</span>
		<span class="text-foreground">{label}</span>
	</div>
	<div
		class="flex flex-col gap-2 font-body text-lg leading-7 [&_:is(p,li)_a]:text-accent-text [&_:is(p,li)_a]:underline [&_:is(p,li)_a]:decoration-accent-text/55 [&_:is(p,li)_a]:underline-offset-[0.2em] [&_li]:mt-2 [&_p]:m-0 [&_p]:font-light [&_p]:text-muted-foreground [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:font-light [&_ul]:text-muted-foreground"
	>
		<h3 class="m-0 text-lg leading-7 font-normal text-foreground">{title}</h3>
		{@render children()}
	</div>
</div>
