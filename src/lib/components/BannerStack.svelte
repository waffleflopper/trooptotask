<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let stackEl: HTMLDivElement | undefined;

	$effect(() => {
		if (!stackEl) return;
		const el = stackEl;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.contentRect.height;
				document.documentElement.style.setProperty('--banner-height', `${height}px`);
			}
		});

		observer.observe(el);

		return () => {
			observer.disconnect();
			document.documentElement.style.removeProperty('--banner-height');
		};
	});
</script>

<div class="fixed inset-x-0 top-0 z-[90] flex flex-col bg-transparent" bind:this={stackEl}>
	{@render children()}
</div>
