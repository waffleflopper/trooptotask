<script lang="ts">
	export interface SearchSelectOption {
		value: string;
		label: string;
		description?: string;
	}

	interface Props {
		options: SearchSelectOption[];
		value: string;
		placeholder?: string;
		disabled?: boolean;
		clearable?: boolean;
		onchange?: (value: string) => void;
		id?: string;
		ariaLabel?: string;
		compact?: boolean;
	}

	let {
		options,
		value = $bindable(),
		placeholder = 'Search...',
		disabled = false,
		clearable = true,
		onchange,
		id = 'ss-' + Math.random().toString(36).slice(2, 8),
		ariaLabel,
		compact = false
	}: Props = $props();

	let query = $state('');
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLUListElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let dropdownStyle = $state('');
	let highlightIndex = $state(-1);
	const listboxId = $derived(`${id}-listbox`);
	const activeDescendant = $derived(highlightIndex >= 0 ? `${id}-option-${highlightIndex}` : undefined);
	const dropdownGap = 4;
	const dropdownViewportPadding = 8;
	const dropdownMaxHeight = 240;

	const selectedOption = $derived(options.find((o) => o.value === value));
	const selectedLabel = $derived(selectedOption?.label ?? '');

	const filtered = $derived.by(() => {
		if (!query.trim()) return options;
		const q = query.toLowerCase();
		return options.filter(
			(o) => o.label.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false)
		);
	});

	function computeDropdownPosition() {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		const spaceAbove = Math.max(rect.top - dropdownViewportPadding, 0);
		const spaceBelow = Math.max(window.innerHeight - rect.bottom - dropdownViewportPadding, 0);
		const openAbove = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
		const availableSpace = openAbove ? spaceAbove : spaceBelow;
		const maxHeight = Math.min(dropdownMaxHeight, availableSpace);

		if (openAbove) {
			dropdownStyle = `position:fixed;top:auto;bottom:${window.innerHeight - rect.top + dropdownGap}px;left:${rect.left}px;right:auto;width:${rect.width}px;max-height:${maxHeight}px;`;
		} else {
			dropdownStyle = `position:fixed;top:${rect.bottom + dropdownGap}px;bottom:auto;left:${rect.left}px;right:auto;width:${rect.width}px;max-height:${maxHeight}px;`;
		}
	}

	function handleFocus() {
		if (disabled) return;
		computeDropdownPosition();
		open = true;
		query = '';
		highlightIndex = -1;
	}

	function handleBlur() {
		// Delay to allow click on option to register
		setTimeout(() => {
			open = false;
			query = '';
		}, 150);
	}

	function selectOption(opt: SearchSelectOption) {
		value = opt.value;
		onchange?.(opt.value);
		open = false;
		query = '';
		inputEl?.blur();
	}

	function clearSelection() {
		value = '';
		onchange?.('');
		query = '';
	}

	function handleClearMousedown(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		clearSelection();
	}

	function handleClearClick(e: MouseEvent) {
		e.stopPropagation();
		if (e.detail !== 0) return;
		e.preventDefault();
		clearSelection();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'Enter') {
				open = true;
				e.preventDefault();
			}
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, filtered.length - 1);
			scrollToHighlighted();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, 0);
			scrollToHighlighted();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (highlightIndex >= 0 && highlightIndex < filtered.length) {
				selectOption(filtered[highlightIndex]);
			}
		} else if (e.key === 'Escape') {
			open = false;
			query = '';
			inputEl?.blur();
		}
	}

	function scrollToHighlighted() {
		if (!listEl) return;
		const item = listEl.children[highlightIndex] as HTMLElement | undefined;
		item?.scrollIntoView({ block: 'nearest' });
	}

	$effect(() => {
		if (!open) return;

		computeDropdownPosition();
	});

	$effect(() => {
		if (!open) return;

		const handleViewportChange = (event?: Event) => {
			if (event?.target instanceof Node && listEl?.contains(event.target)) return;
			computeDropdownPosition();
		};

		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, { capture: true, passive: true });

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && containerEl) {
			resizeObserver = new ResizeObserver(() => {
				computeDropdownPosition();
			});
			resizeObserver.observe(containerEl);
		}

		return () => {
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, { capture: true });
			resizeObserver?.disconnect();
		};
	});
</script>

<div class="search-select" class:disabled class:compact bind:this={containerEl}>
	<div class="input-wrapper" class:open>
		{#if open}
			<input
				bind:this={inputEl}
				{id}
				class="input search-input"
				type="text"
				bind:value={query}
				{placeholder}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				{disabled}
				role="combobox"
				aria-label={ariaLabel}
				aria-expanded={open}
				aria-controls={listboxId}
				aria-autocomplete="list"
				aria-activedescendant={activeDescendant}
			/>
		{:else}
			<button
				{id}
				class="display-btn"
				class:has-value={!!value}
				onclick={() => {
					if (!disabled) {
						computeDropdownPosition();
						open = true;
						setTimeout(() => inputEl?.focus(), 0);
					}
				}}
				{disabled}
				type="button"
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={listboxId}
			>
				<span class="display-copy">
					<span class="display-label">{selectedLabel || placeholder}</span>
					{#if selectedOption?.description}
						<span class="display-description">{selectedOption.description}</span>
					{/if}
				</span>
				<svg class="display-icon" viewBox="0 0 24 24" aria-hidden="true">
					<polyline points="6 9 12 15 18 9"></polyline>
				</svg>
			</button>
			{#if value && !disabled && clearable}
				<button
					class="clear-btn"
					type="button"
					onmousedown={handleClearMousedown}
					onclick={handleClearClick}
					aria-label="Clear selection"
				>
					<span aria-hidden="true">&times;</span>
				</button>
			{/if}
		{/if}
	</div>

	{#if open}
		<ul class="dropdown" style={dropdownStyle} bind:this={listEl} id={listboxId} role="listbox">
			{#if filtered.length === 0}
				<li class="no-results">No matches</li>
			{:else}
				{#each filtered as opt, i (opt.value)}
					<li
						id={`${id}-option-${i}`}
						class="dropdown-item"
						class:highlighted={i === highlightIndex}
						class:selected={opt.value === value}
						role="option"
						aria-selected={opt.value === value}
						onmousedown={() => selectOption(opt)}
					>
						<span class="option-label">{opt.label}</span>
						{#if opt.description}
							<span class="option-description">{opt.description}</span>
						{/if}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.search-select {
		position: relative;
	}

	.search-select.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		border: 1px solid var(--field-border);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--field-bg) 92%, var(--surface-page) 8%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast),
			background-color var(--transition-fast);
	}

	.input-wrapper:hover {
		border-color: var(--ink-35);
	}

	.input-wrapper.open {
		border-color: var(--field-border-focus);
		box-shadow: var(--focus-ring);
	}

	.search-input {
		width: 100%;
		border: none;
		background: transparent;
		box-shadow: none;
		padding-right: 40px;
	}

	.search-input:focus {
		box-shadow: none;
	}

	.display-btn {
		width: 100%;
		text-align: left;
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		min-height: 42px;
		padding: 11px 12px;
		border: none;
		border-radius: calc(var(--radius-md) - 1px);
		background: transparent;
		color: var(--text-tertiary);
		font-size: var(--text-base);
		cursor: pointer;
	}

	.input-wrapper:has(.clear-btn) .display-btn {
		padding-right: 42px;
	}

	.search-select.compact .search-input {
		min-height: 32px;
		padding: 6px 32px 6px 8px;
		font-size: var(--text-sm);
	}

	.search-select.compact .display-btn {
		min-height: 32px;
		padding: 6px 30px 6px 8px;
		font-size: var(--text-sm);
	}

	.search-select.compact .input-wrapper:has(.clear-btn) .display-btn {
		padding-right: 36px;
	}

	.search-select.compact .display-icon {
		width: 14px;
		height: 14px;
	}

	.search-select.compact .clear-btn {
		right: 5px;
		width: 22px;
		height: 22px;
		font-size: 14px;
	}

	.display-btn.has-value {
		color: var(--text-primary);
	}

	.display-copy {
		min-width: 0;
		display: grid;
		gap: 2px;
		overflow: hidden;
	}

	.display-label,
	.display-description,
	.option-label,
	.option-description {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.display-description,
	.option-description {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.display-icon {
		width: 16px;
		height: 16px;
		flex: 0 0 auto;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.clear-btn {
		position: absolute;
		right: 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-tertiary);
		font-size: 16px;
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.clear-btn:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.dropdown {
		position: fixed;
		z-index: var(--z-dropdown);
		max-height: 240px;
		overflow-y: auto;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		list-style: none;
		margin: 0;
		padding: 4px;
		box-shadow: var(--shadow-lg);
	}

	.dropdown-item {
		width: 100%;
		text-align: left;
		display: grid;
		gap: 2px;
		padding: 9px 10px;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--text-primary);
		cursor: pointer;
	}

	.dropdown-item:hover,
	.dropdown-item.highlighted {
		background: var(--surface-subtle);
		border-color: color-mix(in srgb, var(--border-default) 74%, var(--amber) 26%);
	}

	.dropdown-item.selected {
		background: color-mix(in srgb, var(--amber-light) 70%, var(--surface-panel) 30%);
		border-color: color-mix(in srgb, var(--amber) 42%, var(--border-default) 58%);
		color: var(--amber-dark);
		font-weight: var(--font-weight-semibold);
	}

	.dropdown-item.selected .option-description {
		color: color-mix(in srgb, var(--amber-dark) 72%, var(--text-tertiary) 28%);
	}

	.no-results {
		padding: 10px 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
</style>
