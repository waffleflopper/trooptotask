<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { ReadinessBandPalette, ReadinessBandTier } from './types.js';

	let {
		tier,
		palette = 'ramp',
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tier: ReadinessBandTier;
		palette?: ReadinessBandPalette;
	} = $props();
</script>

<span
	data-slot="readiness-band-swatch"
	data-tier={tier}
	data-palette={palette}
	aria-hidden="true"
	class={cn('readiness-band-swatch', className)}
	{...restProps}
></span>

<style>
	.readiness-band-swatch {
		--readiness-band-na-a: color-mix(in srgb, var(--muted) 76%, var(--card) 24%);
		--readiness-band-na-b: color-mix(in srgb, var(--border) 72%, var(--card) 28%);

		display: inline-block;
		width: 0.625rem;
		height: 0.625rem;
		border: 0.5px solid color-mix(in srgb, var(--foreground) 36%, transparent);
		border-radius: 1px;
	}

	.readiness-band-swatch[data-tier='danger'] {
		background: var(--readiness-band-danger);
	}

	.readiness-band-swatch[data-tier='warn'] {
		background: var(--readiness-band-warn);
	}

	.readiness-band-swatch[data-tier='caution'] {
		background: var(--readiness-band-caution);
	}

	.readiness-band-swatch[data-tier='okay'] {
		background: var(--readiness-band-okay);
	}

	.readiness-band-swatch[data-tier='good'] {
		background: var(--readiness-band-good);
	}

	.readiness-band-swatch[data-tier='not-applicable'] {
		background: repeating-linear-gradient(
			45deg,
			var(--readiness-band-na-a),
			var(--readiness-band-na-a) 3px,
			var(--readiness-band-na-b) 3px,
			var(--readiness-band-na-b) 6px
		);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='good'] {
		background: color-mix(in srgb, var(--success) 14%, transparent);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='okay'] {
		background: color-mix(in srgb, var(--warning) 12%, transparent);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='caution'] {
		background: color-mix(in srgb, var(--warning) 28%, transparent);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='warn'] {
		background: color-mix(in srgb, var(--destructive) 18%, transparent);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='danger'] {
		background: var(--destructive);
	}

	.readiness-band-swatch[data-palette='semantic'][data-tier='not-applicable'] {
		background: none;
	}

	.readiness-band-swatch[data-drop] {
		background: none;
		box-shadow: inset 0 0 0 2px var(--foreground);
	}
</style>
