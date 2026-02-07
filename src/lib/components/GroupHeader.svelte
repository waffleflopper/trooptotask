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
			<span class="group-name">{groupName || 'Unassigned'}</span>
		</button>
		<button
			class="pin-btn"
			class:pinned={isPinned}
			onclick={(e) => { e.stopPropagation(); onPinToggle?.(); }}
			title={isPinned ? 'Unpin group' : 'Pin group to top'}
		>
			{isPinned ? '📌' : '📍'}
		</button>
	</div>
	<div class="group-header-spacer"></div>
</div>

<style>
	.group-header {
		display: flex;
		background: var(--color-primary);
		color: white;
		border-bottom: 1px solid var(--color-border);
	}

	.group-info {
		width: var(--personnel-column-width);
		min-width: var(--personnel-column-width);
		display: flex;
		align-items: center;
		background: var(--color-primary);
		border-right: 1px solid rgba(255, 255, 255, 0.2);
		position: sticky;
		left: 0;
		z-index: 2;
	}

	.group-toggle {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		background: transparent;
		color: white;
		text-align: left;
		cursor: pointer;
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.group-toggle:hover {
		background: var(--color-primary-light);
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
		background: var(--color-primary);
	}
</style>
