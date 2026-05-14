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
			aria-pressed={isPinned}
			title={isPinned ? 'Unpin group' : 'Pin group to top'}
		>
			<span class="pin-label">{isPinned ? 'Pinned' : 'Pin'}</span>
		</button>
	</div>
	<div class="group-header-spacer"></div>
</div>

<style>
	.group-header {
		display: grid;
		grid-template-columns: var(--calendar-personnel-column-width) minmax(
				calc(var(--calendar-cell-width) * var(--dates-count, 31)),
				1fr
			);
		width: 100%;
		min-width: calc(var(--calendar-personnel-column-width) + (var(--calendar-cell-width) * var(--dates-count, 31)));
		background: var(--color-chrome);
		color: var(--color-chrome-text);
		border-bottom: 1px solid var(--color-chrome-border);
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
		appearance: none;
		border: none;
		flex: 1;
		padding: 0.5rem 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: transparent;
		color: var(--color-chrome-text);
		text-align: left;
		cursor: pointer;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
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
		appearance: none;
		border-top: none;
		border-right: none;
		border-bottom: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 58px;
		padding: 0 0.5rem;
		background: transparent;
		color: var(--color-chrome-text);
		border-left: 1px solid var(--color-chrome-border);
		opacity: 0.75;
		transition:
			background-color var(--transition-fast),
			opacity var(--transition-fast),
			color var(--transition-fast);
	}

	.pin-btn:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.06);
	}

	.pin-btn.pinned {
		opacity: 1;
		color: var(--accent);
		background: rgba(229, 160, 0, 0.12);
	}

	.pin-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.group-header-spacer {
		flex: 1;
		min-width: calc(var(--calendar-cell-width) * var(--dates-count, 31));
		background: var(--color-chrome);
	}
</style>
