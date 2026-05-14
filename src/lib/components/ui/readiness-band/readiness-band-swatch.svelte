<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { ReadinessBandTier } from './types.js';

	let {
		tier,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		tier: ReadinessBandTier;
	} = $props();
</script>

<span
	data-slot="readiness-band-swatch"
	data-tier={tier}
	aria-hidden="true"
	class={cn('readiness-band-swatch', className)}
	{...restProps}
></span>

<style>
	.readiness-band-swatch {
		--readiness-band-danger: #e8b9a8;
		--readiness-band-warn: #eca382;
		--readiness-band-caution: #f2c878;
		--readiness-band-okay: #c5d89b;
		--readiness-band-good: #9bc361;
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
</style>
