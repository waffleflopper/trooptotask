<script lang="ts">
	import type { Snippet } from 'svelte';
	import PublicHeading from './PublicHeading.svelte';
	import { pageGutter } from './layout';

	interface Props {
		lines: readonly [string, string];
		copy: string;
		action: Snippet;
	}

	let { lines, copy, action }: Props = $props();
</script>

<section class="bg-chrome pt-16 sm:pt-24 lg:pt-40">
	<div class={pageGutter}>
		<div class="pb-16 sm:pb-24 lg:pb-32">
			<PublicHeading {lines} tone="dark" accent />
			<div class="mt-8 flex flex-col gap-8 lg:mt-12 lg:flex-row lg:items-end lg:justify-between lg:gap-20">
				<p class="m-0 max-w-[520px] font-body text-lg leading-7 font-light text-chrome-text-muted">{copy}</p>
				<div class="flex shrink-0">
					{@render action()}
				</div>
			</div>
		</div>
	</div>
</section>
