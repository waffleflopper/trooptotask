<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id?: string;
		label: string;
		alternate?: boolean;
		title: Snippet;
		children: Snippet;
	}

	let { id, label, alternate = false, title, children }: Props = $props();
</script>

<section
	{id}
	class={[
		'scroll-mt-28 border-b border-border px-8 py-16 max-sm:px-4 max-sm:py-12',
		alternate ? 'bg-card-alt' : 'bg-card'
	]}
>
	<div
		class="mx-auto max-w-[780px] [&>:is(p,ul,div)+:is(p,ul,div)]:mt-4 [&_li]:my-[0.65rem] [&_li]:leading-[1.75] [&_li]:font-normal [&_p]:m-0 [&_p]:text-base [&_p]:leading-[1.8] [&_p]:font-normal [&_p]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:m-0 [&_ul]:pl-[1.2rem] [&_ul]:text-muted-foreground [&_:is(li,p)_a]:text-accent-text [&_:is(li,p)_a]:underline [&_:is(li,p)_a]:decoration-accent-text/55 [&_:is(li,p)_a]:underline-offset-[0.2em]"
	>
		<div class="mb-4 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent-text uppercase">
			{label}
		</div>
		<h2
			class="m-0 mb-4 font-heading text-[length:clamp(2rem,4vw,3rem)] leading-[0.98] font-bold tracking-[0.03em] text-foreground uppercase [&_em]:font-light [&_em]:text-accent [&_em]:italic"
		>
			{@render title()}
		</h2>
		{@render children()}
	</div>
</section>
