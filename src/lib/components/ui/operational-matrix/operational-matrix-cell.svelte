<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { operationalMatrixStateIcon, operationalMatrixStateLabel } from './operational-matrix-state.js';
	import type { OperationalMatrixState } from './types.js';

	interface Props {
		state?: OperationalMatrixState;
		label?: string;
		value?: string | number | null;
		rowLabel: string;
		columnLabel: string;
		detail?: string;
		actionLabel?: string;
		onSelect?: () => void;
		disabled?: boolean;
		readOnly?: boolean;
		labelVisibility?: 'visible' | 'hidden';
		children?: Snippet;
		detailContent?: Snippet;
	}

	let {
		state = 'neutral',
		label,
		value = null,
		rowLabel,
		columnLabel,
		detail,
		actionLabel,
		onSelect,
		disabled = false,
		readOnly = false,
		labelVisibility = 'visible',
		children,
		detailContent
	}: Props = $props();

	const stateLabel = $derived(label ?? operationalMatrixStateLabel(state));
	const stateIcon = $derived(operationalMatrixStateIcon(state));
	const resolvedVisualMode = $derived(labelVisibility === 'hidden' ? 'icon' : 'label');
	const accessibleLabel = $derived(
		`${rowLabel} ${columnLabel}: ${stateLabel}${value ? `, ${value}` : ''}${detail ? `. ${detail}` : ''}`
	);
	const actionAccessibleLabel = $derived(actionLabel ? `${actionLabel}. ${accessibleLabel}` : accessibleLabel);
	const interactive = $derived(Boolean(onSelect) && !readOnly);
</script>

<td
	class="operational-matrix-cell"
	data-slot="operational-matrix-cell"
	data-state={state}
	data-visual-mode={resolvedVisualMode}
>
	{#snippet cellContent()}
		<span class="cell-mark" aria-hidden="true">{stateIcon}</span>
		<span class="cell-copy">
			<span class="cell-label">{stateLabel}</span>
			{#if value !== null && value !== undefined && value !== ''}
				<span class="cell-value">{value}</span>
			{/if}
		</span>
		{@render children?.()}
	{/snippet}

	{#if detailContent || detail}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					{#if interactive}
						<button
							{...props}
							type="button"
							class="cell-action"
							aria-label={actionAccessibleLabel}
							{disabled}
							onclick={onSelect}
						>
							{@render cellContent()}
						</button>
					{:else}
						<span {...props} class="cell-static" role="gridcell" aria-label={accessibleLabel} tabindex="0">
							{@render cellContent()}
						</span>
					{/if}
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>
				{#if detailContent}
					{@render detailContent()}
				{:else}
					{detail}
				{/if}
			</Tooltip.Content>
		</Tooltip.Root>
	{:else if interactive}
		<button type="button" class="cell-action" aria-label={actionAccessibleLabel} {disabled} onclick={onSelect}>
			{@render cellContent()}
		</button>
	{:else}
		<span
			class="cell-static"
			role="gridcell"
			aria-label={accessibleLabel}
			tabindex={readOnly || disabled ? undefined : 0}
		>
			{@render cellContent()}
		</span>
	{/if}
</td>

<style>
	.operational-matrix-cell {
		width: var(--matrix-cell-width);
		min-width: var(--matrix-cell-width);
		max-width: var(--matrix-cell-width);
		height: var(--matrix-row-min-height);
		padding: 0;
		border-right: 1px solid var(--matrix-rule);
		border-bottom: 1px solid var(--matrix-rule);
		background: var(--card);
		color: var(--foreground);
		text-align: left;
		vertical-align: middle;
	}

	.cell-action,
	.cell-static {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr);
		width: 100%;
		min-height: var(--matrix-row-min-height);
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0.5rem;
		color: inherit;
	}

	.operational-matrix-cell[data-visual-mode='icon'] .cell-action,
	.operational-matrix-cell[data-visual-mode='icon'] .cell-static {
		grid-template-columns: 1fr;
		justify-items: center;
		padding: 0.25rem;
	}

	.operational-matrix-cell[data-visual-mode='icon'] .cell-copy {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.cell-action {
		border: 0;
		background: transparent;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}

	.cell-action:hover {
		background: color-mix(in srgb, var(--foreground) 6%, transparent);
	}

	.cell-action:focus-visible,
	.cell-static:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}

	.cell-action:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.cell-mark {
		display: inline-grid;
		width: 1.25rem;
		height: 1.25rem;
		place-items: center;
		border: 1px solid var(--matrix-rule);
		border-radius: var(--radius-sm);
		background: var(--background);
		color: var(--foreground);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
	}

	.cell-copy {
		display: grid;
		min-width: 0;
		gap: 0.125rem;
	}

	.cell-label,
	.cell-value {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cell-label {
		font-size: 0.6875rem;
		font-weight: 700;
		line-height: 1.1;
	}

	.cell-value {
		color: var(--muted-foreground);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.04em;
		line-height: 1.1;
	}

	.operational-matrix-cell[data-state='complete'],
	.operational-matrix-cell[data-state='success'] {
		background: color-mix(in srgb, var(--success-muted) 70%, var(--card) 30%);
		color: var(--success-foreground);
	}

	.operational-matrix-cell[data-state='warning'] {
		background: color-mix(in srgb, var(--warning-muted) 76%, var(--card) 24%);
		color: var(--warning-foreground);
	}

	.operational-matrix-cell[data-state='expired'],
	.operational-matrix-cell[data-state='danger'] {
		background: color-mix(in srgb, var(--danger-muted) 76%, var(--card) 24%);
		color: var(--danger-foreground);
	}

	.operational-matrix-cell[data-state='assigned'],
	.operational-matrix-cell[data-state='info'] {
		background: color-mix(in srgb, var(--info-muted) 74%, var(--card) 26%);
		color: var(--info-foreground);
	}

	.operational-matrix-cell[data-state='incomplete'],
	.operational-matrix-cell[data-state='empty'],
	.operational-matrix-cell[data-state='disabled'] {
		background:
			repeating-linear-gradient(
				45deg,
				transparent,
				transparent 4px,
				color-mix(in srgb, var(--muted-foreground) 8%, transparent) 4px,
				color-mix(in srgb, var(--muted-foreground) 8%, transparent) 5px
			),
			var(--card);
		color: var(--muted-foreground);
	}

	.operational-matrix-cell[data-state='complete'] .cell-mark,
	.operational-matrix-cell[data-state='success'] .cell-mark {
		border-color: color-mix(in srgb, var(--success) 24%, transparent);
		background: var(--success-muted);
		color: var(--success-foreground);
	}

	.operational-matrix-cell[data-state='warning'] .cell-mark {
		border-color: color-mix(in srgb, var(--warning) 24%, transparent);
		background: var(--warning-muted);
		color: var(--warning-foreground);
	}

	.operational-matrix-cell[data-state='expired'] .cell-mark,
	.operational-matrix-cell[data-state='danger'] .cell-mark {
		border-color: color-mix(in srgb, var(--danger) 24%, transparent);
		background: var(--danger-muted);
		color: var(--danger-foreground);
	}

	.operational-matrix-cell[data-state='assigned'] .cell-mark,
	.operational-matrix-cell[data-state='info'] .cell-mark {
		border-color: color-mix(in srgb, var(--info) 24%, transparent);
		background: var(--info-muted);
		color: var(--info-foreground);
	}

	@media (max-width: 44rem) {
		.operational-matrix-cell:not([data-visual-mode='icon']) {
			--matrix-cell-width: 6rem;
		}

		.cell-action,
		.cell-static {
			grid-template-columns: 1rem minmax(0, 1fr);
			gap: 0.25rem;
			padding: 0.375rem;
		}

		.cell-mark {
			width: 1rem;
			height: 1rem;
			font-size: 0.625rem;
		}
	}
</style>
