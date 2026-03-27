<script lang="ts">
	import MonthYearPicker from './MonthYearPicker.svelte';

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
		pickerYear?: number;
		pickerMonth?: number;
		onSelectMonthYear?: (year: number, month: number) => void;
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
		titleTestId,
		pickerYear,
		pickerMonth,
		onSelectMonthYear
	}: Props = $props();

	let pickerOpen = $state(false);

	function togglePicker() {
		if (!onSelectMonthYear) return;
		pickerOpen = !pickerOpen;
	}

	function closePicker() {
		pickerOpen = false;
	}

	function handleSelectMonthYear(year: number, month: number) {
		onSelectMonthYear?.(year, month);
		closePicker();
	}

	function stopMouseDownPropagation(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<div class="navigation">
	<div class="month-nav">
		<button class="btn btn-secondary btn-sm" onclick={onPrev} aria-label={prevLabel}>
			&larr; {prevLabel}
		</button>
		<div class="month-title-wrap">
			<h2 class="month-title">
				{#if onSelectMonthYear && pickerYear !== undefined && pickerMonth !== undefined}
					<button
						class="month-title-trigger"
						type="button"
						data-testid={titleTestId}
						aria-expanded={pickerOpen}
						aria-haspopup="dialog"
						onmousedown={stopMouseDownPropagation}
						onclick={togglePicker}
					>
						{title}
					</button>
				{:else}
					<span data-testid={titleTestId}>{title}</span>
				{/if}
			</h2>
			{#if pickerOpen && pickerYear !== undefined && pickerMonth !== undefined}
				<div class="month-picker-popover">
					<MonthYearPicker
						year={pickerYear}
						month={pickerMonth}
						onSelect={handleSelectMonthYear}
						onClose={closePicker}
					/>
				</div>
			{/if}
		</div>
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

	.month-title-wrap {
		position: relative;
		display: flex;
		justify-content: center;
	}

	.month-title {
		font-size: var(--font-size-xl);
		font-weight: 600;
		min-width: 180px;
		text-align: center;
	}

	.month-title-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-xs);
		width: 100%;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-md);
		padding: var(--spacing-2xs) var(--spacing-xs);
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast);
	}

	.month-title-trigger:hover {
		background: var(--color-primary-tint);
	}

	.month-title-trigger:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.month-picker-popover {
		position: absolute;
		top: calc(100% + var(--spacing-sm));
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-dropdown);
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
		font-weight: var(--font-weight-medium);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
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

		.month-title-wrap {
			flex: 1;
		}

		.month-title {
			font-size: var(--font-size-lg);
			min-width: unset;
			flex: 1;
		}

		.month-picker-popover {
			left: 0;
			right: 0;
			transform: none;
			display: flex;
			justify-content: center;
		}

		.nav-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
