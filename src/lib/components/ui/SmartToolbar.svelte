<script lang="ts" module>
	export interface DropdownItem {
		label: string;
		href?: string;
		onclick?: () => void;
		disabled?: boolean;
	}

	export interface SmartToolbarItem {
		type: 'button' | 'dropdown' | 'icon-button' | 'overflow';
		label: string;
		icon?: string;
		href?: string;
		onclick?: () => void;
		disabled?: boolean;
		items?: DropdownItem[];
	}
</script>

<script lang="ts">
	interface Props {
		items: SmartToolbarItem[];
		narrow?: boolean;
	}

	let { items, narrow = false }: Props = $props();

	let openDropdown = $state<string | null>(null);

	const OVERFLOW_KEY = '__overflow__';

	const overflowItems = $derived(items.filter((i) => i.type === 'overflow'));
	const collapsibleItems = $derived(items.filter((i) => i.type !== 'overflow'));
	const hasOverflowMenu = $derived(overflowItems.length > 0 || narrow);

	function toggleDropdown(label: string) {
		openDropdown = openDropdown === label ? null : label;
	}

	function closeDropdown() {
		openDropdown = null;
	}
</script>

{#snippet menuItem(item: DropdownItem)}
	{#if item.href}
		<a
			class="menu-item"
			role="menuitem"
			href={item.disabled ? undefined : item.href}
			aria-disabled={item.disabled || undefined}
			onclick={() => {
				if (!item.disabled) closeDropdown();
			}}>{item.label}</a
		>
	{:else}
		<button
			class="menu-item"
			type="button"
			role="menuitem"
			disabled={item.disabled}
			onclick={() => {
				if (!item.disabled) {
					item.onclick?.();
					closeDropdown();
				}
			}}>{item.label}</button
		>
	{/if}
{/snippet}

<div class="smart-toolbar" data-testid="smart-toolbar" data-narrow={narrow}>
	{#if !narrow}
		{#each collapsibleItems as item}
			{#if item.type === 'button'}
				<button class="toolbar-btn" type="button" disabled={item.disabled} onclick={item.onclick}>
					{item.label}
				</button>
			{:else if item.type === 'dropdown'}
				<div class="dropdown-wrapper">
					<button
						class="toolbar-btn dropdown-trigger"
						type="button"
						aria-haspopup="menu"
						aria-expanded={openDropdown === item.label}
						onclick={() => toggleDropdown(item.label)}
					>
						{item.label}
						<svg
							class="chevron"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<polyline points="6 9 12 15 18 9" />
						</svg>
					</button>
					{#if openDropdown === item.label}
						<div class="dropdown-menu" role="menu">
							{#each item.items ?? [] as dropdownItem}
								{@render menuItem(dropdownItem)}
							{/each}
						</div>
					{/if}
				</div>
			{:else if item.type === 'icon-button'}
				<button
					class="toolbar-btn icon-btn"
					type="button"
					aria-label={item.label}
					disabled={item.disabled}
					onclick={item.onclick}
				>
					{#if item.icon}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html item.icon}
					{/if}
				</button>
			{/if}
		{/each}
	{/if}

	{#if hasOverflowMenu}
		<div class="dropdown-wrapper">
			<button
				class="toolbar-btn more-btn"
				type="button"
				aria-label="More actions"
				aria-haspopup="menu"
				aria-expanded={openDropdown === OVERFLOW_KEY}
				onclick={() => toggleDropdown(OVERFLOW_KEY)}
			>
				<span>More</span>
				<svg
					class="chevron"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>
			{#if openDropdown === OVERFLOW_KEY}
				<div class="dropdown-menu" role="menu">
					{#if narrow}
						{#each collapsibleItems as item}
							{#if item.type === 'button' || item.type === 'icon-button'}
								{@render menuItem({
									label: item.label,
									href: item.href,
									onclick: item.onclick,
									disabled: item.disabled
								})}
							{:else if item.type === 'dropdown'}
								<div class="group-header">{item.label}</div>
								{#each item.items ?? [] as dropdownItem}
									{@render menuItem(dropdownItem)}
								{/each}
							{/if}
						{/each}
						{#if overflowItems.length > 0}
							<div class="divider" role="separator"></div>
						{/if}
					{/if}
					{#each overflowItems as item}
						{@render menuItem({ label: item.label, href: item.href, onclick: item.onclick, disabled: item.disabled })}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.smart-toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.toolbar-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
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
		white-space: nowrap;
	}

	.toolbar-btn:hover:not(:disabled) {
		background: var(--color-surface-variant);
	}

	.toolbar-btn:disabled {
		color: var(--color-text-muted);
		cursor: default;
	}

	.icon-btn {
		width: 32px;
		padding: 0;
		justify-content: center;
	}

	.chevron {
		flex-shrink: 0;
	}

	.dropdown-wrapper {
		position: relative;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 100;
		min-width: 180px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-3);
		padding: 4px 0;
	}

	.menu-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 8px 12px;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		text-decoration: none;
		transition: background var(--transition-fast);
	}

	.menu-item:hover:not([disabled]):not([aria-disabled='true']) {
		background: var(--color-surface-variant, rgba(0, 0, 0, 0.04));
	}

	.menu-item[disabled],
	.menu-item[aria-disabled='true'] {
		color: var(--color-text-muted);
		cursor: default;
		pointer-events: none;
	}

	.group-header {
		padding: 6px 12px 2px;
		font-family: var(--font-mono);
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.divider {
		height: 1px;
		background: var(--color-divider);
		margin: 4px 0;
	}
</style>
