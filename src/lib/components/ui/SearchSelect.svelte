<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}

	interface Props {
		options: Option[];
		value: string;
		placeholder?: string;
		disabled?: boolean;
		onchange?: (value: string) => void;
		id?: string;
	}

	let {
		options,
		value = $bindable(),
		placeholder = 'Search...',
		disabled = false,
		onchange,
		id = 'ss-' + Math.random().toString(36).slice(2, 8)
	}: Props = $props();

	let query = $state('');
	let open = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLUListElement | null>(null);
	let highlightIndex = $state(-1);

	const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? '');

	const filtered = $derived.by(() => {
		if (!query.trim()) return options;
		const q = query.toLowerCase();
		return options.filter((o) => o.label.toLowerCase().includes(q));
	});

	function handleFocus() {
		if (disabled) return;
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

	function selectOption(opt: Option) {
		value = opt.value;
		onchange?.(opt.value);
		open = false;
		query = '';
		inputEl?.blur();
	}

	function clearSelection(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		value = '';
		onchange?.('');
		query = '';
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
</script>

<div class="search-select" class:disabled>
	<div class="input-wrapper" class:open>
		{#if open}
			<input
				bind:this={inputEl}
				class="input search-input"
				type="text"
				bind:value={query}
				{placeholder}
				onfocus={handleFocus}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				{disabled}
				role="combobox"
				aria-expanded={open}
				aria-controls="{id}-listbox"
				aria-autocomplete="list"
				aria-activedescendant={highlightIndex >= 0 ? `${id}-option-${highlightIndex}` : undefined}
			/>
		{:else}
			<button
				class="display-btn"
				class:has-value={!!value}
				onclick={() => {
					if (!disabled) inputEl?.focus();
					open = true;
					setTimeout(() => inputEl?.focus(), 0);
				}}
				{disabled}
				type="button"
			>
				{selectedLabel || placeholder}
			</button>
			{#if value && !disabled}
				<button class="clear-btn" type="button" onmousedown={clearSelection} tabindex="-1" aria-label="Clear selection"
					>&times;</button
				>
			{/if}
		{/if}
	</div>

	{#if open}
		<ul class="dropdown" bind:this={listEl} id="{id}-listbox" role="listbox">
			{#if filtered.length === 0}
				<li class="no-results">No matches</li>
			{:else}
				{#each filtered as opt, i (opt.value)}
					<li
						id="{id}-option-{i}"
						class="dropdown-item"
						class:highlighted={i === highlightIndex}
						class:selected={opt.value === value}
						role="option"
						aria-selected={opt.value === value}
						onmousedown={() => selectOption(opt)}
					>
						{opt.label}
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
	}

	.search-input {
		width: 100%;
	}

	.display-btn {
		width: 100%;
		text-align: left;
		padding: var(--spacing-sm) var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
		cursor: pointer;
		min-height: 36px;
	}

	.display-btn.has-value {
		color: var(--color-text);
	}

	.display-btn:hover {
		border-color: var(--color-text-muted);
	}

	.clear-btn {
		position: absolute;
		right: 8px;
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: 16px;
		cursor: pointer;
		padding: 2px 4px;
		line-height: 1;
	}

	.clear-btn:hover {
		color: var(--color-text);
	}

	.dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 100;
		max-height: 200px;
		overflow-y: auto;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-top: none;
		border-radius: 0 0 var(--radius-md) var(--radius-md);
		list-style: none;
		margin: 0;
		padding: 0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.dropdown-item {
		width: 100%;
		text-align: left;
		padding: var(--spacing-xs) var(--spacing-md);
		background: none;
		border: none;
		font-size: var(--font-size-sm);
		color: var(--color-text);
		cursor: pointer;
	}

	.dropdown-item:hover,
	.dropdown-item.highlighted {
		background: var(--color-surface-variant);
	}

	.dropdown-item.selected {
		font-weight: 600;
		color: var(--color-primary);
	}

	.no-results {
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
