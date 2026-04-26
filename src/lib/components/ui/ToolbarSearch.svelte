<script lang="ts">
	interface Props {
		ariaLabel: string;
		value?: string;
		placeholder?: string;
		testId?: string;
		width?: 'default' | 'wide' | 'full';
		onValueChange?: (value: string) => void;
		onKeydown?: (event: KeyboardEvent) => void;
	}

	let {
		ariaLabel,
		value = $bindable(''),
		placeholder = 'Search...',
		testId,
		width = 'default',
		onValueChange,
		onKeydown
	}: Props = $props();

	const searchClass = $derived(['toolbar-search', `toolbar-search--${width}`].join(' '));

	function handleInput() {
		onValueChange?.(value);
	}
</script>

<input
	type="search"
	class={searchClass}
	aria-label={ariaLabel}
	{placeholder}
	bind:value
	oninput={handleInput}
	onkeydown={onKeydown}
	data-testid={testId}
/>

<style>
	.toolbar-search {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		flex: 0 0 min(20rem, 100%);
		width: min(20rem, 100%);
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-size: var(--text-sm);
		white-space: nowrap;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.toolbar-search--wide {
		flex-basis: min(24rem, 100%);
		width: min(24rem, 100%);
	}

	.toolbar-search--full {
		flex: 1 1 18rem;
		width: 100%;
	}

	.toolbar-search:hover,
	.toolbar-search:focus {
		border-color: var(--ink-35);
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.toolbar-search:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.toolbar-search::placeholder {
		color: var(--text-muted);
	}
</style>
