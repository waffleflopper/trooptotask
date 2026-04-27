<script lang="ts">
	export interface ToolbarSelectOption {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		ariaLabel: string;
		options: ToolbarSelectOption[];
		value?: string;
		width?: 'default' | 'wide';
		disabled?: boolean;
		onValueChange?: (value: string) => void;
	}

	let {
		ariaLabel,
		options,
		value = $bindable(''),
		width = 'default',
		disabled = false,
		onValueChange
	}: Props = $props();

	const selectClass = $derived(['toolbar-select', `toolbar-select--${width}`].join(' '));

	function handleChange(event: Event) {
		value = (event.currentTarget as HTMLSelectElement).value;
		onValueChange?.(value);
	}
</script>

<select class={selectClass} aria-label={ariaLabel} {disabled} bind:value onchange={handleChange}>
	{#each options as option (option.value)}
		<option value={option.value} disabled={option.disabled}>{option.label}</option>
	{/each}
</select>

<style>
	.toolbar-select {
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		height: 34px;
		max-width: 12rem;
		padding: 0 var(--sp-8) 0 var(--sp-3);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		appearance: none;
		background-color: var(--surface-panel);
		background-image:
			linear-gradient(45deg, transparent 50%, currentColor 50%),
			linear-gradient(135deg, currentColor 50%, transparent 50%);
		background-position:
			calc(100% - 15px) 14px,
			calc(100% - 10px) 14px;
		background-repeat: no-repeat;
		background-size:
			5px 5px,
			5px 5px;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.toolbar-select--wide {
		max-width: 16rem;
	}

	.toolbar-select:hover,
	.toolbar-select:focus {
		border-color: var(--ink-35);
		background-color: var(--surface-subtle);
		color: var(--text-primary);
	}

	.toolbar-select:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.toolbar-select:disabled {
		cursor: not-allowed;
		opacity: 0.62;
	}
</style>
