<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		ariaLabel?: string;
		maxHeight?: string;
	}

	let { children, ariaLabel = 'Scrollable operational matrix', maxHeight = 'min(42rem, 70dvh)' }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="operational-matrix-viewport"
	data-slot="operational-matrix-viewport"
	role="region"
	aria-label={ariaLabel}
	tabindex="0"
	style:max-height={maxHeight}
>
	{@render children?.()}
</div>

<style>
	.operational-matrix-viewport {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--card);
	}

	.operational-matrix-viewport:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.operational-matrix-viewport::-webkit-scrollbar {
		width: 0.625rem;
		height: 0.625rem;
	}

	.operational-matrix-viewport::-webkit-scrollbar-track {
		background: var(--muted);
	}

	.operational-matrix-viewport::-webkit-scrollbar-thumb {
		border: 2px solid var(--muted);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--muted-foreground) 44%, transparent);
	}
</style>
