<script lang="ts">
	export interface SegmentedControlOption {
		value: string;
		label: string;
		disabled?: boolean;
		title?: string;
	}

	interface Props {
		ariaLabel: string;
		options: SegmentedControlOption[];
		value?: string;
		onValueChange?: (value: string) => void;
	}

	let { ariaLabel, options, value = $bindable(''), onValueChange }: Props = $props();

	function selectValue(nextValue: string) {
		value = nextValue;
		onValueChange?.(nextValue);
	}
</script>

<div class="segmented-control" role="group" aria-label={ariaLabel}>
	{#each options as option (option.value)}
		<button
			class="segmented-control__button"
			class:active={value === option.value}
			type="button"
			aria-pressed={value === option.value}
			disabled={option.disabled}
			title={option.title}
			onclick={() => selectValue(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.segmented-control {
		display: inline-flex;
		align-items: stretch;
		flex: 0 0 auto;
		min-width: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		overflow: hidden;
	}

	.segmented-control__button {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 34px;
		padding: 0 var(--sp-3);
		border: 0;
		border-right: 1px solid var(--border-default);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast);
	}

	.segmented-control__button:last-child {
		border-right: 0;
	}

	.segmented-control__button:hover:not(:disabled) {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.segmented-control__button:focus-visible {
		outline: var(--focus-outline);
		outline-offset: -2px;
		box-shadow: inset 0 0 0 2px var(--focus-ring-color);
	}

	.segmented-control__button.active {
		background: color-mix(in srgb, var(--amber) 14%, var(--surface-panel) 86%);
		color: var(--amber-dark);
	}

	.segmented-control__button:disabled {
		color: var(--text-tertiary);
		cursor: not-allowed;
	}
</style>
