<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		label?: string;
		href?: string;
		actionLabel?: string;
		onSelect?: () => void;
		disabled?: boolean;
	}

	let { children, label, href, actionLabel, onSelect, disabled = false }: Props = $props();
</script>

<th scope="row" class="operational-matrix-row-header" data-slot="operational-matrix-row-header">
	{#if href}
		<a
			href={disabled ? undefined : href}
			class="row-header-action"
			aria-label={actionLabel ?? label}
			aria-disabled={disabled ? 'true' : undefined}
			tabindex={disabled ? -1 : undefined}
		>
			{@render children?.()}
		</a>
	{:else if onSelect && !disabled}
		<button type="button" class="row-header-action" aria-label={actionLabel ?? label} onclick={onSelect}>
			{@render children?.()}
		</button>
	{:else}
		<span class="row-header-content" aria-label={label}>
			{@render children?.()}
		</span>
	{/if}
</th>

<style>
	.operational-matrix-row-header {
		position: sticky;
		left: 0;
		z-index: 10;
		width: var(--matrix-row-header-width);
		min-width: var(--matrix-row-header-width);
		max-width: var(--matrix-row-header-width);
		min-height: var(--matrix-row-min-height);
		padding: 0;
		border-right: 1px solid var(--matrix-rule-strong);
		border-bottom: 1px solid var(--matrix-rule);
		background: var(--card);
		color: var(--foreground);
		text-align: left;
		vertical-align: middle;
	}

	.row-header-action,
	.row-header-content {
		display: grid;
		width: 100%;
		min-height: var(--matrix-row-min-height);
		align-items: center;
		gap: 0.125rem;
		padding: 0.5rem 0.75rem;
		color: inherit;
		text-align: left;
		text-decoration: none;
	}

	.row-header-action {
		border: 0;
		background: transparent;
		cursor: pointer;
		font: inherit;
	}

	.row-header-action:hover {
		background: var(--muted);
	}

	.row-header-action:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}
</style>
