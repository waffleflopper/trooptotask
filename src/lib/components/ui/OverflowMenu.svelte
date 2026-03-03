<script lang="ts" module>
	export interface OverflowItem {
		label: string;
		onclick?: () => void;
		href?: string;
		toggle?: boolean;
		active?: boolean;
		divider?: boolean;
		group?: string;
		danger?: boolean;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	interface Props {
		items: OverflowItem[];
		open: boolean;
		onClose: () => void;
		align?: 'left' | 'right';
	}

	let { items, open, onClose, align = 'right' }: Props = $props();

	let menuEl: HTMLElement | undefined = $state();

	$effect(() => {
		if (!open) return;

		function handleMouseDown(e: MouseEvent) {
			if (menuEl && !menuEl.contains(e.target as Node)) {
				onClose();
			}
		}

		window.addEventListener('mousedown', handleMouseDown);

		return () => {
			window.removeEventListener('mousedown', handleMouseDown);
		};
	});

	function handleItemClick(item: OverflowItem) {
		if (item.disabled) return;
		if (item.onclick) {
			item.onclick();
			onClose();
		}
	}
</script>

{#if open}
	<div
		class="overflow-menu"
		class:align-left={align === 'left'}
		class:align-right={align === 'right'}
		bind:this={menuEl}
		role="menu"
	>
		{#each items as item}
			{#if item.divider}
				<div class="divider" role="separator"></div>
			{/if}

			{#if item.group}
				<div class="group-label">{item.group}</div>
			{/if}

			{#if item.href}
				<a
					class="menu-item"
					class:danger={item.danger}
					class:disabled={item.disabled}
					href={item.disabled ? undefined : item.href}
					role="menuitem"
					aria-disabled={item.disabled || undefined}
					onclick={() => {
						if (!item.disabled) onClose();
					}}
				>
					<span class="menu-item-label">{item.label}</span>
					{#if item.toggle && item.active}
						<span class="checkmark">&#10003;</span>
					{/if}
				</a>
			{:else}
				<button
					class="menu-item"
					class:danger={item.danger}
					class:disabled={item.disabled}
					type="button"
					role="menuitem"
					aria-disabled={item.disabled || undefined}
					disabled={item.disabled}
					onclick={() => handleItemClick(item)}
				>
					<span class="menu-item-label">{item.label}</span>
					{#if item.toggle && item.active}
						<span class="checkmark">&#10003;</span>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.overflow-menu {
		position: absolute;
		top: 100%;
		z-index: 1000;
		min-width: 180px;
		max-height: 400px;
		overflow-y: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-3);
		padding: 4px 0;
		margin-top: 4px;
	}

	.align-right {
		right: 0;
	}

	.align-left {
		left: 0;
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
		gap: 8px;
	}

	.menu-item:hover:not(.disabled) {
		background: var(--color-surface-variant, rgba(0, 0, 0, 0.04));
	}

	.menu-item.danger {
		color: var(--color-error);
	}

	.menu-item.disabled {
		color: var(--color-text-muted);
		cursor: default;
		pointer-events: none;
	}

	button.menu-item:disabled {
		color: var(--color-text-muted);
		cursor: default;
	}

	.menu-item-label {
		flex: 1;
	}

	.checkmark {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.divider {
		height: 1px;
		background: var(--color-divider);
		margin: 4px 0;
	}

	.group-label {
		font-family: var(--font-mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
		padding: 8px 12px 4px;
		user-select: none;
	}
</style>
