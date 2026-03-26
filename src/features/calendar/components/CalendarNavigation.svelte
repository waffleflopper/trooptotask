<script lang="ts">
	interface Props {
		title: string;
		onPrev: () => void;
		onNext: () => void;
		onGoToToday: () => void;
		viewMode?: 'month' | '3-month';
		onToggleViewMode?: () => void;
		prevLabel?: string;
		nextLabel?: string;
		titleTestId?: string;
	}

	let {
		title,
		onPrev,
		onNext,
		onGoToToday,
		viewMode = 'month',
		onToggleViewMode,
		prevLabel = 'Prev',
		nextLabel = 'Next',
		titleTestId
	}: Props = $props();
</script>

<div class="navigation">
	<div class="month-nav">
		<button class="btn btn-secondary btn-sm" onclick={onPrev} aria-label={prevLabel}>
			&larr; {prevLabel}
		</button>
		<h2 class="month-title" data-testid={titleTestId}>{title}</h2>
		<button class="btn btn-secondary btn-sm" onclick={onNext} aria-label={nextLabel}>
			{nextLabel} &rarr;
		</button>
	</div>
	<div class="nav-actions">
		{#if onToggleViewMode}
			<button
				class="view-toggle"
				class:active={viewMode === '3-month'}
				data-testid="calendar-view-toggle"
				onclick={onToggleViewMode}
				title={viewMode === 'month' ? 'Switch to 3-month view' : 'Switch to month view'}
			>
				<svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
					<path
						d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
					/>
				</svg>
				3-Month
			</button>
		{/if}
		<button class="btn btn-primary btn-sm" onclick={onGoToToday}>Today</button>
	</div>
</div>

<style>
	.navigation {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.month-nav {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.month-title {
		font-size: var(--font-size-xl);
		font-weight: 600;
		min-width: 180px;
		text-align: center;
	}

	.nav-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.view-toggle:hover {
		border-color: var(--color-primary);
		color: var(--color-text);
	}

	.view-toggle.active {
		border-color: var(--color-primary);
		background: var(--color-primary);
		color: var(--color-primary-contrast);
	}

	@media (max-width: 640px) {
		.navigation {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm);
		}

		.month-nav {
			width: 100%;
			justify-content: space-between;
			gap: var(--spacing-sm);
		}

		.month-title {
			font-size: var(--font-size-lg);
			min-width: unset;
			flex: 1;
		}

		.nav-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
