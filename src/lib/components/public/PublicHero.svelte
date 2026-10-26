<script lang="ts">
	import type { Snippet } from 'svelte';
	import PublicHeading from './PublicHeading.svelte';
	import PublicSection from './PublicSection.svelte';

	interface Props {
		label: string;
		lines: readonly [string, string];
		aside?: Snippet;
		children: Snippet;
	}

	let { label, lines, aside, children }: Props = $props();
</script>

<PublicSection tone="dark" class="gap-0 lg:gap-0">
	<PublicHeading {label} {lines} tone="dark" accent level="h1" />
	<div class="mt-10 flex flex-col gap-10 lg:mt-16 lg:flex-row lg:items-start lg:justify-between lg:gap-20">
		<p class="m-0 max-w-[520px] font-body text-lg leading-7 font-light text-chrome-text-muted lg:pt-2.5">
			{@render children()}
		</p>
		{#if aside}
			<div class="w-full lg:w-[420px] lg:shrink-0">
				{@render aside()}
			</div>
		{/if}
	</div>
</PublicSection>
