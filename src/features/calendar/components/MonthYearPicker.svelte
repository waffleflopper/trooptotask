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
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		padding: var(--sp-4);
		width: 240px;
		z-index: var(--z-dropdown);
	}

	.year-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-2);
	}

	.year-label {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-primary);
	}

	.year-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-primary);
		cursor: pointer;
		font-size: var(--text-ui-sm);
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast);
	}

	.year-btn:hover {
		border-color: var(--amber);
		background: rgba(var(--amber-rgb), var(--opacity-light));
	}

	.month-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-1);
	}

	.month-btn {
		padding: var(--sp-2) var(--sp-1);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		color: var(--text-primary);
		font-size: var(--text-ui-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.month-btn:hover {
		background: rgba(var(--amber-rgb), var(--opacity-light));
		border-color: var(--amber);
	}

	.month-btn.current {
		background: var(--amber);
		color: var(--accent-contrast);
		font-weight: var(--font-weight-bold);
	}
</style>
