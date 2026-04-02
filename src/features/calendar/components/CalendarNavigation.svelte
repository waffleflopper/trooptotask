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
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
	}

	.month-nav {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.month-title-wrap {
		position: relative;
		display: flex;
		justify-content: center;
	}

	.month-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.25rem + 0.7vw, 2rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.05em;
		line-height: var(--line-height-tight);
		text-transform: uppercase;
		min-width: 180px;
		text-align: center;
	}

	.month-title-trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-1);
		width: 100%;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast);
	}

	.month-title-trigger:hover {
		background: var(--amber-light);
		color: var(--amber-dark);
	}

	.month-title-trigger:focus-visible {
		outline: 2px solid var(--amber);
		outline-offset: 2px;
	}

	.month-picker-popover {
		position: absolute;
		top: calc(100% + var(--sp-2));
		left: 50%;
		transform: translateX(-50%);
		z-index: var(--z-dropdown);
	}

	.nav-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		min-height: 34px;
		padding: 7px 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.view-toggle:hover {
		border-color: var(--ink-35);
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.view-toggle.active {
		border-color: var(--amber);
		background: var(--amber-light);
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.navigation {
			padding: var(--sp-4);
		}

		.month-nav {
			width: 100%;
			justify-content: space-between;
			gap: var(--sp-2);
		}

		.month-title-wrap {
			flex: 1;
		}

		.month-title {
			font-size: clamp(1.25rem, 1rem + 1vw, 1.7rem);
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
			justify-content: flex-start;
		}
	}
</style>
