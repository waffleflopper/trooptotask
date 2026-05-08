<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		year: number;
		month: number;
		onSelect: (year: number, month: number) => void;
		onClose: () => void;
	}

	let { year, month, onSelect, onClose }: Props = $props();

	const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	let displayYear = $derived(year);
	let pickerEl = $state<HTMLDivElement | null>(null);
	let monthButtons = $state<Array<HTMLButtonElement | null>>([]);
	let hasAutoFocused = $state(false);

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

<div
	bind:this={pickerEl}
	class="z-50 w-60 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md"
	role="dialog"
	aria-label="Month and year picker"
>
	<div class="mb-2 flex items-center justify-between">
		<Button variant="outline" size="icon-sm" onclick={() => (displayYear -= 1)} aria-label="Previous year">
			<ChevronLeftIcon aria-hidden="true" />
		</Button>
		<span class="text-base font-semibold text-foreground">{displayYear}</span>
		<Button variant="outline" size="icon-sm" onclick={() => (displayYear += 1)} aria-label="Next year">
			<ChevronRightIcon aria-hidden="true" />
		</Button>
	</div>

	<div class="grid grid-cols-3 gap-1">
		{#each MONTH_LABELS as label, i (label)}
			<button
				bind:this={monthButtons[i]}
				class={[
					'focus-visible:ring-ring cursor-pointer rounded-lg border border-transparent bg-popover px-1 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:outline-none',
					displayYear === year && i === month && 'bg-primary text-primary-foreground hover:bg-primary/90'
				]}
				aria-current={displayYear === year && i === month ? 'true' : undefined}
				onkeydown={(event) => handleMonthKeydown(event, i)}
				onclick={() => onSelect(displayYear, i)}
			>
				{label}
			</button>
		{/each}
	</div>
</div>
