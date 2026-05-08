<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	interface Props {
		ariaLabel: string;
		children?: Snippet;
		loading?: boolean;
		disabled?: boolean;
		readOnly?: boolean;
		density?: 'default' | 'dense' | 'compact';
	}

	let { ariaLabel, children, loading = false, disabled = false, readOnly = false, density = 'dense' }: Props = $props();
</script>

<section
	data-slot="operational-matrix"
	data-density={density}
	data-loading={loading ? 'true' : undefined}
	data-disabled={disabled ? 'true' : undefined}
	data-readonly={readOnly ? 'true' : undefined}
	aria-label={ariaLabel}
	aria-busy={loading ? 'true' : undefined}
	class="operational-matrix"
>
	<Tooltip.Provider>
		{@render children?.()}
	</Tooltip.Provider>
</section>

<style>
	.operational-matrix {
		--matrix-rule: color-mix(in srgb, var(--border) 78%, transparent);
		--matrix-rule-strong: color-mix(in srgb, var(--foreground) 18%, var(--border) 82%);
		--matrix-cell-width: 7.5rem;
		--matrix-row-header-width: 15rem;
		--matrix-row-min-height: 2.5rem;
		--matrix-header-height: 4.75rem;
		--matrix-table-min-width: 100%;

		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--matrix-rule);
		border-radius: var(--radius-lg);
		background: var(--card);
		color: var(--card-foreground);
	}

	.operational-matrix[data-density='default'] {
		--matrix-cell-width: 9.5rem;
		--matrix-row-header-width: 16.5rem;
		--matrix-row-min-height: 3rem;
		--matrix-header-height: 5.75rem;
	}

	.operational-matrix[data-density='compact'] {
		--matrix-cell-width: 2rem;
		--matrix-row-header-width: 13.5rem;
		--matrix-row-min-height: 2rem;
		--matrix-header-height: 7.25rem;
		--matrix-table-min-width: max-content;
	}

	.operational-matrix[data-disabled='true'],
	.operational-matrix[data-readonly='true'] {
		background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
	}
</style>
