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

<div class="banner-stack" bind:this={stackEl}>
	{@render children()}
</div>

<style>
	.banner-stack {
		position: fixed;
		top: var(--header-height, 56px);
		left: 0;
		right: 0;
		z-index: 90;
		display: flex;
		flex-direction: column;
	}
</style>
