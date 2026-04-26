<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		title?: string;
		href?: string;
		disabled?: boolean;
		onclick?: () => void;
		children?: Snippet;
	}

	let { label, title = label, href, disabled = false, onclick, children }: Props = $props();
</script>

{#if href && !disabled}
	<a class="toolbar-icon-button" aria-label={label} {title} {href}>
		{#if children}
			{@render children()}
		{/if}
	</a>
{:else}
	<button class="toolbar-icon-button" type="button" aria-label={label} {title} {disabled} {onclick}>
		{#if children}
			{@render children()}
		{/if}
	</button>
{/if}

<style>
	.toolbar-icon-button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		text-decoration: none;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.toolbar-icon-button:hover:not(:disabled) {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.toolbar-icon-button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.toolbar-icon-button:disabled {
		color: var(--text-tertiary);
		cursor: not-allowed;
	}
</style>
