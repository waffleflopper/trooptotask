<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		meta?: string;
		title: Snippet;
		children: Snippet;
	}

	let { label, meta, title, children }: Props = $props();
</script>

<section class="relative overflow-hidden bg-chrome px-8 pt-20 pb-16 text-center max-sm:px-4 max-sm:pt-16 max-sm:pb-12">
	<div class="pointer-events-none absolute inset-0 bg-noise opacity-[0.03]"></div>
	<div class="relative z-10 mx-auto max-w-[720px]">
		<div class="mb-4 font-mono text-[0.6875rem] font-semibold tracking-[0.12em] text-accent uppercase">{label}</div>
		<h1
			class="m-0 font-heading text-[length:clamp(2.8rem,6vw,4.75rem)] leading-[0.94] font-extrabold tracking-[0.04em] text-chrome-text uppercase [&_em]:font-light [&_em]:text-accent [&_em]:italic"
		>
			{@render title()}
		</h1>
		<div
			class="mt-4 [&>p+p]:mt-5 [&_p]:mx-auto [&_p]:max-w-[560px] [&_p]:text-[1.1875rem] [&_p]:leading-[1.7] [&_p]:text-chrome-text-muted max-sm:[&_p]:text-base"
		>
			{@render children()}
		</div>
		{#if meta}
			<p
				class="mx-auto mt-5 max-w-[560px] font-mono text-[0.6875rem] leading-[1.7] font-medium tracking-[0.12em] text-chrome-text-muted uppercase"
			>
				{meta}
			</p>
		{/if}
	</div>
</section>
