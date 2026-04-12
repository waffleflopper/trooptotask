<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		href?: string;
		/** Amber dot in header to signal requires attention */
		signal?: boolean;
		/** Error state */
		error?: string | null;
		children: Snippet;
		/** Slot for sub-config inline panel (renders below header in configure mode) */
		config?: Snippet;
		/** Whether configure mode is active (shows config gear) */
		configureMode?: boolean;
		onConfigToggle?: () => void;
		configOpen?: boolean;
	}

	let {
		label,
		href,
		signal = false,
		error = null,
		children,
		config,
		configureMode = false,
		onConfigToggle,
		configOpen = false
	}: Props = $props();
</script>

<article class="widget" class:widget--signal={signal} class:widget--error={!!error}>
	<header class="widget-header">
		<span class="widget-label">
			{#if signal}
				<span class="widget-signal-dot" aria-hidden="true"></span>
			{/if}
			{label}
		</span>
		<div class="widget-header-actions">
			{#if configureMode && config && onConfigToggle}
				<button
					class="widget-config-btn"
					onclick={onConfigToggle}
					aria-label="Configure widget"
					aria-expanded={configOpen}
					title="Configure"
				>
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
						<circle cx="8" cy="8" r="2.5" />
						<path
							d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.22 3.22l1.06 1.06M11.72 11.72l1.06 1.06M3.22 12.78l1.06-1.06M11.72 4.28l1.06-1.06"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			{/if}
			{#if href}
				<a {href} class="widget-view-all" tabindex="0">
					View all
					<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
						<path d="M2.5 6h7M6.5 3l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</a>
			{/if}
		</div>
	</header>

	{#if configOpen && config}
		<div class="widget-config-panel">
			{@render config()}
		</div>
	{/if}

	{#if error}
		<div class="widget-error" role="alert">
			<span>{error}</span>
		</div>
	{:else}
		<div class="widget-body">
			{@render children()}
		</div>
	{/if}
</article>

<style>
	.widget {
		display: flex;
		flex-direction: column;
		background: var(--paper);
		border: var(--border-thin);
		min-height: 140px;
		container-type: inline-size;
	}

	.widget-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-rule);
		flex-shrink: 0;
	}

	.widget-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		color: var(--ink-35);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.widget-signal-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--amber);
		flex-shrink: 0;
	}

	.widget-header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.widget-view-all {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-35);
		text-decoration: none;
		display: flex;
		align-items: center;
		gap: 3px;
		transition: color var(--transition-fast);
	}

	.widget-view-all:hover,
	.widget-view-all:focus-visible {
		color: var(--amber);
	}

	.widget-view-all:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		border-radius: var(--radius-sm);
	}

	.widget-view-all svg {
		width: 10px;
		height: 10px;
	}

	.widget-config-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border: none;
		background: transparent;
		color: var(--ink-35);
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 0;
		transition:
			color var(--transition-fast),
			background var(--transition-fast);
	}

	.widget-config-btn:hover {
		color: var(--ink);
		background: var(--ink-06);
	}

	.widget-config-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.widget-config-btn svg {
		width: 14px;
		height: 14px;
	}

	.widget-config-panel {
		padding: var(--sp-3);
		border-bottom: var(--border-rule);
		background: var(--ink-03);
		flex-shrink: 0;
	}

	.widget-body {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.widget-error {
		flex: 1;
		display: flex;
		align-items: center;
		padding: var(--sp-4);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--danger);
	}

	/* Signal state: amber top rule */
	.widget--signal {
		border-top-color: var(--amber);
		border-top-width: 2px;
	}

	/* Error state */
	.widget--error {
		border-top-color: var(--danger);
		border-top-width: 2px;
	}
</style>
