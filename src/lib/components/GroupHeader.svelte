<script lang="ts">
	interface Props {
		groupName: string;
		isCollapsed?: boolean;
		isPinned?: boolean;
		onToggle?: () => void;
		onPinToggle?: () => void;
	}

	let { groupName, isCollapsed = false, isPinned = false, onToggle, onPinToggle }: Props = $props();
</script>

<div class="group-header">
	<div class="group-info">
		<button class="group-toggle" onclick={onToggle}>
			<span class="toggle-icon">{isCollapsed ? '▶' : '▼'}</span>
			<span class="group-name">{groupName}</span>
		</button>
		<button
			class="pin-btn"
			class:pinned={isPinned}
			onclick={(e) => {
				e.stopPropagation();
				onPinToggle?.();
			}}
			title={isPinned ? 'Unpin group' : 'Pin group to top'}
		>
			{isPinned ? '📌' : '📍'}
		</button>
	</div>
	<div class="group-header-spacer"></div>
</div>

<style>
	.group-header {
		display: grid;
		grid-template-columns: var(--personnel-column-width) minmax(calc(var(--cell-width) * var(--dates-count, 31)), 1fr);
		width: 100%;
		min-width: calc(var(--personnel-column-width) + (var(--cell-width) * var(--dates-count, 31)));
		background: var(--color-chrome);
		color: var(--color-chrome-text);
		border-bottom: 1px solid var(--color-border);
	}

	.group-info {
		display: flex;
		align-items: center;
		background: var(--color-chrome);
		border-right: 1px solid var(--color-chrome-border);
		position: sticky;
		left: 0;
		z-index: 4;
	}

	.group-toggle {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		background: transparent;
		color: var(--color-chrome-text);
		text-align: left;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.group-toggle:hover {
		background: var(--color-chrome-hover, rgba(255, 255, 255, 0.05));
	}

	.toggle-icon {
		font-size: 10px;
		width: 12px;
	}

	.group-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pin-btn {
		padding: var(--spacing-xs);
		background: transparent;
		color: white;
		opacity: 0.5;
		font-size: 12px;
		line-height: 1;
		transition: opacity 0.15s ease;
	}

	.pin-btn:hover {
		opacity: 1;
	}

	.pin-btn.pinned {
		opacity: 1;
	}

	.group-header-spacer {
		flex: 1;
		min-width: calc(var(--cell-width) * var(--dates-count, 31));
		background: var(--color-chrome);
	}
</style>
