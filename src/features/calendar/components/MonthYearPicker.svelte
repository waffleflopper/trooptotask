<script lang="ts">
	interface Props {
		year: number;
		month: number;
		onSelect: (year: number, month: number) => void;
		onClose: () => void;
	}

	let { year, month, onSelect, onClose }: Props = $props();

	const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	let displayYear = $state(new Date().getFullYear());
	let pickerEl = $state<HTMLDivElement | null>(null);
	let monthButtons: Array<HTMLButtonElement | null> = [];
	let hasAutoFocused = $state(false);

	$effect(() => {
		displayYear = year;
	});

	$effect(() => {
		if (!pickerEl || hasAutoFocused) return;
		hasAutoFocused = true;
		queueMicrotask(() => focusMonthButton(month));
	});

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleDocumentMouseDown(event: MouseEvent) {
		if (!pickerEl) return;
		if (event.target instanceof Node && !pickerEl.contains(event.target)) {
			onClose();
		}
	}

	function focusMonthButton(index: number) {
		monthButtons[index]?.focus();
	}

	function moveFocus(index: number, delta: number) {
		const nextIndex = index + delta;
		if (nextIndex >= 0 && nextIndex < MONTH_LABELS.length) {
			focusMonthButton(nextIndex);
			return;
		}

		if (nextIndex < 0) {
			displayYear -= 1;
			queueMicrotask(() => focusMonthButton(MONTH_LABELS.length - 1));
			return;
		}

		displayYear += 1;
		queueMicrotask(() => focusMonthButton(0));
	}

	function handleMonthKeydown(event: KeyboardEvent, index: number) {
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				moveFocus(index, 1);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				moveFocus(index, -1);
				break;
			case 'ArrowDown':
				event.preventDefault();
				moveFocus(index, 3);
				break;
			case 'ArrowUp':
				event.preventDefault();
				moveFocus(index, -3);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				onSelect(displayYear, index);
				break;
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />
<svelte:document onmousedown={handleDocumentMouseDown} />

<div bind:this={pickerEl} class="month-year-picker" role="dialog" aria-label="Month and year picker">
	<div class="year-nav">
		<button class="year-btn" onclick={() => (displayYear -= 1)} aria-label="Previous year"> &larr; </button>
		<span class="year-label">{displayYear}</span>
		<button class="year-btn" onclick={() => (displayYear += 1)} aria-label="Next year"> &rarr; </button>
	</div>

	<div class="month-grid">
		{#each MONTH_LABELS as label, i}
			<button
				bind:this={monthButtons[i]}
				class="month-btn"
				class:current={displayYear === year && i === month}
				aria-current={displayYear === year && i === month ? 'true' : undefined}
				onkeydown={(event) => handleMonthKeydown(event, i)}
				onclick={() => onSelect(displayYear, i)}
			>
				{label}
			</button>
		{/each}
	</div>
</div>

<style>
	.month-year-picker {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-2);
		padding: var(--spacing-md);
		width: 240px;
		z-index: var(--z-dropdown);
	}

	.year-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-sm);
	}

	.year-label {
		font-size: var(--font-size-md);
		font-weight: 600;
		color: var(--color-text);
	}

	.year-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		font-size: var(--font-size-sm);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.year-btn:hover {
		border-color: var(--color-primary);
		background: var(--color-primary-tint);
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-xs);
	}

	.month-btn {
		padding: var(--spacing-sm) var(--spacing-xs);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.month-btn:hover {
		background: var(--color-primary-tint);
		border-color: var(--color-primary);
	}

	.month-btn.current {
		background: var(--color-primary);
		color: var(--color-primary-contrast);
		font-weight: var(--font-weight-bold);
	}
</style>
