<script lang="ts">
	import type { Snippet } from 'svelte';
	import OverflowMenu, { type OverflowItem } from './ui/OverflowMenu.svelte';
	import HelpButton from './ui/HelpButton.svelte';

	interface Breadcrumb {
		label: string;
		href?: string;
	}

	interface Props {
		title: string;
		helpTopic?: string;
		overflowItems?: OverflowItem[];
		variant?: 'default' | 'compact' | 'transparent';
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
		['page-toolbar', variant !== 'default' ? variant : '', sticky ? 'sticky' : ''].filter(Boolean).join(' ')
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
		gap: 0;
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.page-toolbar.compact {
		padding: var(--spacing-xs) var(--spacing-lg);
	}

	.page-toolbar.compact .toolbar-title {
		font-size: var(--font-size-base);
	}

	.page-toolbar.transparent {
		background: transparent;
		border-bottom: none;
	}

	.page-toolbar.sticky {
		position: sticky;
		top: calc(var(--header-height, 56px) + var(--banner-height, 0px));
		z-index: 10;
	}

	.toolbar-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.toolbar-title-area {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.toolbar-leading {
		flex: 1;
	}

	.toolbar-title {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		color: var(--color-text);
		margin: 0;
	}

	.toolbar-subtitle {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-xs);
		overflow-x: auto;
	}

	.breadcrumb-link {
		color: var(--color-text-muted);
		text-decoration: none;
		white-space: nowrap;
	}

	.breadcrumb-link:hover {
		color: var(--color-primary);
	}

	.breadcrumb-sep {
		color: var(--color-text-disabled);
	}

	.breadcrumb-current {
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.toolbar-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.toolbar-below {
		margin-top: var(--spacing-sm);
	}

	.overflow-wrapper {
		position: relative;
	}

	.more-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: auto;
		height: 32px;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.more-btn:hover {
		background: var(--color-surface-variant);
	}

	@media (max-width: 640px) {
		.page-toolbar {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.toolbar-main {
			flex-wrap: wrap;
		}

		.toolbar-actions {
			order: 3;
			width: 100%;
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			padding-bottom: var(--spacing-xs);
		}

		.toolbar-actions :global(.btn) {
			white-space: nowrap;
			font-size: var(--font-size-sm);
			padding: 6px 12px;
			min-height: 32px;
		}

		.breadcrumbs {
			font-size: var(--font-size-xs);
		}
	}
</style>
