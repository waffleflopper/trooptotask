<script lang="ts">
	export interface TagOption {
		value: string;
		label: string;
	}

	interface Props {
		options: TagOption[];
		value: string[];
		placeholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		onChange: (values: string[]) => void;
	}

	let { options, value, placeholder = 'Select...', ariaLabel, disabled = false, onChange }: Props = $props();

	let inputEl = $state<HTMLInputElement | null>(null);
	let containerEl = $state<HTMLDivElement | null>(null);
	let dropdownEl = $state<HTMLUListElement | null>(null);
	let isOpen = $state(false);
	let dropdownStyle = $state('');
	let query = $state('');
	let activeIndex = $state(-1);

	const uid = Math.random().toString(36).slice(2, 8);
	const listId = `mts-list-${uid}`;

	const selectedSet = $derived(new Set(value));
	const selectedOptions = $derived(
		value.map((v) => options.find((o) => o.value === v)).filter((o): o is TagOption => !!o)
	);
	const filteredOptions = $derived.by(() => {
		const q = query.toLowerCase().trim();
		if (!q) return options;
		return options.filter((opt) => opt.label.toLowerCase().includes(q));
	});

	function updateDropdownPosition() {
		if (!containerEl) return;

		const rect = containerEl.getBoundingClientRect();
		const spaceBelow = window.innerHeight - rect.bottom;
		if (spaceBelow < 260) {
			dropdownStyle = `position:fixed;top:auto;bottom:${window.innerHeight - rect.top + 4}px;left:${rect.left}px;right:auto;width:${rect.width}px;`;
			return;
		}

		dropdownStyle = `position:fixed;top:${rect.bottom + 4}px;bottom:auto;left:${rect.left}px;right:auto;width:${rect.width}px;`;
	}

	function open() {
		if (disabled) return;
		updateDropdownPosition();
		isOpen = true;
		activeIndex = -1;
	}

	function close() {
		isOpen = false;
		query = '';
		activeIndex = -1;
	}

	function toggle(optValue: string) {
		const next = selectedSet.has(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue];
		onChange(next);
		inputEl?.focus();
	}

	function removeTag(optValue: string, e: MouseEvent) {
		e.stopPropagation();
		onChange(value.filter((v) => v !== optValue));
	}

	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'Escape':
				close();
				break;
			case 'ArrowDown':
				e.preventDefault();
				if (!isOpen) {
					open();
					return;
				}
				activeIndex = Math.min(activeIndex + 1, filteredOptions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				activeIndex = Math.max(activeIndex - 1, 0);
				break;
			case 'Enter':
				e.preventDefault();
				if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
					toggle(filteredOptions[activeIndex].value);
					query = '';
					activeIndex = -1;
				}
				break;
			case 'Backspace':
				if (!query && value.length > 0) {
					onChange(value.slice(0, -1));
				}
				break;
		}
	}

	$effect(() => {
		function onMousedown(e: MouseEvent) {
			if (containerEl && !containerEl.contains(e.target as Node)) {
				close();
			}
		}
		document.addEventListener('mousedown', onMousedown);
		return () => {
			document.removeEventListener('mousedown', onMousedown);
		};
	});

	$effect(() => {
		if (!isOpen) return;

		value;
		query;
		updateDropdownPosition();
	});

	$effect(() => {
		if (!isOpen) return;

		const handleViewportChange = (event?: Event) => {
			if (event?.target instanceof Node && dropdownEl?.contains(event.target)) {
				return;
			}

			updateDropdownPosition();
		};

		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, { capture: true, passive: true });

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined' && containerEl) {
			resizeObserver = new ResizeObserver(() => {
				updateDropdownPosition();
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

<div
	class="mts"
	class:is-open={isOpen}
	class:is-disabled={disabled}
	bind:this={containerEl}
	onfocusout={(e) => {
		if (!containerEl?.contains(e.relatedTarget as Node | null)) {
			close();
		}
	}}
>
	<div
		class="mts-control"
		role="none"
		onclick={() => {
			if (!disabled) {
				open();
				inputEl?.focus();
			}
		}}
	>
		{#each selectedOptions as opt (opt.value)}
			<span class="mts-tag">
				<span class="mts-tag-label">{opt.label}</span>
				<button
					type="button"
					class="mts-tag-remove"
					aria-label={`Remove ${opt.label}`}
					tabindex="-1"
					{disabled}
					onmousedown={(e) => removeTag(opt.value, e)}>×</button
				>
			</span>
		{/each}
		<input
			bind:this={inputEl}
			type="text"
			class="mts-input"
			placeholder={value.length === 0 ? placeholder : ''}
			aria-label={ariaLabel}
			aria-expanded={isOpen}
			aria-haspopup="listbox"
			aria-controls={listId}
			aria-autocomplete="list"
			role="combobox"
			{disabled}
			bind:value={query}
			oninput={() => {
				if (!isOpen) open();
				activeIndex = -1;
			}}
			onfocus={open}
			onkeydown={handleKeydown}
		/>
	</div>

	{#if isOpen}
		<ul
			id={listId}
			bind:this={dropdownEl}
			class="mts-dropdown"
			style={dropdownStyle}
			role="listbox"
			aria-multiselectable="true"
			aria-label={ariaLabel ?? 'Options'}
		>
			{#if filteredOptions.length === 0}
				<li class="mts-no-options" role="option" aria-selected="false">
					No options match "{query}"
				</li>
			{:else}
				{#each filteredOptions as opt, i (opt.value)}
					<li
						class="mts-option"
						class:is-active={i === activeIndex}
						class:is-selected={selectedSet.has(opt.value)}
						role="option"
						aria-selected={selectedSet.has(opt.value)}
						onmousedown={(e) => {
							e.preventDefault();
							toggle(opt.value);
						}}
					>
						<span class="mts-check" aria-hidden="true">
							{#if selectedSet.has(opt.value)}
								<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10">
									<polyline points="1.5,6.5 4.5,9.5 10.5,2.5" />
								</svg>
							{/if}
						</span>
						{opt.label}
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
</div>

<style>
	.mts {
		position: relative;
	}

	.mts-control {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 5px 8px;
		min-height: 38px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-page);
		cursor: text;
		align-items: center;
		transition:
			border-color 0.1s,
			box-shadow 0.1s;
	}

	.mts.is-open .mts-control {
		border-color: var(--amber);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--amber) 20%, transparent);
	}

	.mts.is-disabled .mts-control {
		background: var(--surface-subtle);
		cursor: not-allowed;
		opacity: 0.6;
	}

	.mts-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--amber-light) 75%, var(--surface-panel) 25%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--amber-dark);
		max-width: 180px;
	}

	.mts-tag-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mts-tag-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--amber-dark);
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
		flex-shrink: 0;
	}

	.mts-tag-remove:hover {
		background: color-mix(in srgb, var(--amber-dark) 15%, transparent);
	}

	.mts-input {
		flex: 1;
		min-width: 80px;
		border: none;
		outline: none;
		background: transparent;
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text-primary);
		padding: 0;
	}

	.mts-input::placeholder {
		color: var(--text-tertiary);
	}

	.mts-input:disabled {
		cursor: not-allowed;
	}

	.mts-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 500;
		margin: 0;
		padding: var(--sp-1) 0;
		list-style: none;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		box-shadow: 0 4px 16px color-mix(in srgb, var(--text-primary) 10%, transparent);
		max-height: 240px;
		overflow-y: auto;
	}

	.mts-option {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 7px 12px;
		font-size: var(--text-sm);
		color: var(--text-primary);
		cursor: pointer;
		user-select: none;
	}

	.mts-option:hover,
	.mts-option.is-active {
		background: var(--surface-subtle);
	}

	.mts-option.is-selected {
		color: var(--amber-dark);
		font-weight: var(--font-weight-medium);
	}

	.mts-check {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		color: var(--amber-dark);
	}

	.mts-no-options {
		padding: var(--sp-3) 12px;
		font-size: var(--text-sm);
		color: var(--text-tertiary);
		cursor: default;
	}
</style>
