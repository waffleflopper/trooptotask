<script lang="ts">
	import type { Snippet } from 'svelte';
	import OverflowMenu from '$lib/components/ui/OverflowMenu.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';
	import HelpButton from '$lib/components/ui/HelpButton.svelte';

	interface Breadcrumb {
		label: string;
		href?: string;
	}

	interface Props {
		title: string;
		helpTopic?: string;
		overflowItems?: OverflowItem[];
		variant?: 'default' | 'compact';
		sticky?: boolean;
		breadcrumbs?: Breadcrumb[];
		subtitle?: string;
		children?: Snippet;
		leading?: Snippet;
		below?: Snippet;
	}

	let {
		title,
		helpTopic,
		overflowItems = [],
		variant = 'default',
		sticky = false,
		breadcrumbs,
		subtitle,
		children,
		leading,
		below
	}: Props = $props();

	let showOverflow = $state(false);

	const toolbarClass = $derived(
		['page-toolbar', variant === 'compact' ? variant : '', sticky ? 'sticky' : ''].filter(Boolean).join(' ')
	);
</script>

<div class={toolbarClass} data-testid="page-toolbar">
	{#if breadcrumbs && breadcrumbs.length > 0}
		<nav class="breadcrumbs" aria-label="Breadcrumb">
			{#each breadcrumbs as crumb, i}
				{#if i > 0}<span class="breadcrumb-sep" aria-hidden="true">/</span>{/if}
				{#if crumb.href && i < breadcrumbs.length - 1}
					<a href={crumb.href} class="breadcrumb-link">{crumb.label}</a>
				{:else}
					<span class="breadcrumb-current" aria-current={i === breadcrumbs.length - 1 ? 'page' : undefined}
						>{crumb.label}</span
					>
				{/if}
			{/each}
		</nav>
	{/if}

	<div class="toolbar-main">
		{#if leading}
			<div class="toolbar-leading">
				{@render leading()}
			</div>
		{:else}
			<div class="toolbar-title-area">
				<h2 class="toolbar-title">
					{title}{#if helpTopic}<HelpButton topic={helpTopic} />{/if}
				</h2>
				{#if subtitle}
					<span class="toolbar-subtitle">{subtitle}</span>
				{/if}
			</div>
		{/if}

		{#if children}
			<div class="toolbar-actions">
				{@render children()}
			</div>
		{/if}

		{#if overflowItems.length > 0}
			<div class="overflow-wrapper">
				<button
					type="button"
					class="more-btn"
					aria-label="More actions"
					aria-expanded={showOverflow}
					aria-haspopup="menu"
					onclick={() => (showOverflow = !showOverflow)}
				>
					<span>More</span>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				<OverflowMenu items={overflowItems} align="right" open={showOverflow} onClose={() => (showOverflow = false)} />
			</div>
		{/if}
	</div>

	{#if below}
		<div class="toolbar-below">
			{@render below()}
		</div>
	{/if}
</div>

<style>
	.page-toolbar {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-5) var(--sp-6);
		background: var(--toolbar-bg);
		border-bottom: 1px solid var(--toolbar-border);
	}

	.page-toolbar.compact {
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-6);
	}

	.page-toolbar.compact .toolbar-title {
		font-size: var(--text-xl);
	}

	.page-toolbar.sticky {
		position: sticky;
		top: calc(var(--header-height, 56px) + var(--banner-height, 0px));
		z-index: 10;
		backdrop-filter: blur(10px);
		background: color-mix(in srgb, var(--toolbar-bg) 88%, transparent);
	}

	.toolbar-main {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.toolbar-title-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
	}

	.toolbar-leading {
		flex: 1;
		min-width: 0;
	}

	.toolbar-title {
		font-family: var(--font-display);
		font-size: clamp(1.75rem, 1.4rem + 1vw, 2.4rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		line-height: var(--line-height-tight);
		text-transform: uppercase;
		color: var(--text-primary);
		margin: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.toolbar-subtitle {
		font-family: var(--font-body);
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		overflow-x: auto;
	}

	.breadcrumb-link {
		color: var(--text-tertiary);
		text-decoration: none;
		white-space: nowrap;
	}

	.breadcrumb-link:hover {
		color: var(--amber);
	}

	.breadcrumb-sep {
		color: var(--amber);
	}

	.breadcrumb-current {
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--sp-2);
	}

	.toolbar-below {
		padding-top: var(--sp-3);
		border-top: var(--border-rule);
	}

	.overflow-wrapper {
		position: relative;
	}

	.more-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		width: auto;
		min-height: 34px;
		padding: 7px 12px;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.more-btn:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.more-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	@media (max-width: 640px) {
		.page-toolbar {
			padding: var(--sp-4);
		}

		.toolbar-main {
			flex-wrap: wrap;
			align-items: stretch;
		}

		.toolbar-actions {
			order: 3;
			width: 100%;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			justify-content: flex-start;
			padding-bottom: var(--sp-1);
		}

		.toolbar-actions :global(.btn) {
			white-space: nowrap;
			font-size: var(--text-sm);
			padding: 6px 12px;
			min-height: 32px;
		}

		.breadcrumbs {
			font-size: var(--text-xs);
		}
	}
</style>
