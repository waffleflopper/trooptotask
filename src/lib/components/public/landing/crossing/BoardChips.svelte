<script lang="ts">
	import { chips, statusKey, type Chip } from './boardData';

	interface Props {
		/** Takes the chips out of rendering while they cannot be seen. */
		hidden?: boolean;
	}

	let { hidden = false }: Props = $props();

	/** Per-chip custom properties: scatter, tilt and timing for every chip, plus the slot for chips that land. */
	function placement(chip: Chip): string {
		const vars: Record<string, number | string | undefined> = {
			'--sx-w': chip.wide.x,
			'--sy-w': chip.wide.y,
			'--sx-p': chip.phone?.x,
			'--sy-p': chip.phone?.y,
			'--tilt': chip.tilt,
			'--shrink': chip.shrink,
			'--appear': chip.appear,
			'--lead': chip.lead
		};
		if (chip.kind !== 'noise') Object.assign(vars, { '--row': chip.row, '--grp': chip.group });
		if (chip.kind === 'block') {
			Object.assign(vars, {
				'--col': chip.start,
				'--span-w': chip.span,
				'--span-p': chip.phoneSpan,
				'--fill': `var(--l-status-${chip.status})`
			});
		}
		return Object.entries(vars)
			.filter(([, value]) => value !== undefined)
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ');
	}
</script>

<!-- The facts: names and statuses that fly out of the mess into the board, and noise that never lands. -->
<div class="facts" aria-hidden="true" {hidden}>
	{#each chips as chip, index (index)}
		{#if chip.kind === 'block'}
			<span class={['fact', 'status', !chip.phone && 'wide-only']} style={placement(chip)}>
				{statusKey[chip.status].code}
			</span>
		{:else if chip.kind === 'name'}
			<span class={['fact', 'soldier', !chip.phone && 'wide-only']} style={placement(chip)}>
				<b>{chip.rank}</b>
				{chip.name}
			</span>
		{:else}
			<span class="fact noise" style={placement(chip)}>
				{#if chip.rank}<b>{chip.rank}</b>{/if}
				{chip.text}
			</span>
		{/if}
	{/each}
</div>

<style>
	/* Registered so each chip resolves its flight to a number once per frame instead of re-expanding it in every use. */
	@property --fact-t {
		syntax: '<number>';
		inherits: true;
		initial-value: 0;
	}

	@property --fact-e {
		syntax: '<number>';
		inherits: true;
		initial-value: 0;
	}

	.facts {
		position: absolute;
		inset: 0;
		pointer-events: none;
		contain: strict;
		will-change: transform;
	}

	.fact {
		--sx: var(--sx-w);
		--sy: var(--sy-w);
		--span: var(--span-w);
		--settle: 0;
		/* Lights up among the mess between p 0.54 and 0.60. */
		--lit: clamp(0, calc((var(--p) - var(--appear)) / 0.015), 1);
		position: absolute;
		top: 0;
		left: 0;
		display: flex;
		align-items: center;
		white-space: nowrap;
		font-family: 'IBM Plex Mono', monospace;
		color: var(--l-ink);
		opacity: var(--lit);
		/* A hairline edge keeps a scattered chip distinct on light spreadsheets; it dissolves as the chip settles. */
		outline: 1px solid color-mix(in oklch, var(--l-ink) calc((1 - var(--settle)) * 45%), transparent);
		outline-offset: -1px;
		border-radius: 2px;
	}

	/*
	 * Paper behind a scattered chip, so it reads on the night. Status chips grow theirs into
	 * the block; a Soldier chip keeps its own, which vanishes into the board's matching paper.
	 */
	.fact::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: 2px;
		background: var(--l-day);
	}

	.fact b {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	/*
	 * Landing chips. The line reaches the slot's row at `--arrive`. The flight leaves
	 * when the line is 0.12 of the frame short of the row, or of the chip itself if it
	 * waits lower in the frame, so every chip stays ahead of the line and lands as the
	 * line passes. Lower rows land first.
	 */
	.soldier,
	.status {
		--mid: calc(var(--by-f) + var(--head-f) + (var(--grp) + 1) * var(--band-f) + (var(--row) + 0.5) * var(--row-f));
		--arrive: calc(0.62 + 0.3 * (1 - var(--mid)));
		--depart: max(
			calc(0.62 + var(--lead)),
			calc(0.62 + 0.3 * (0.88 - max(var(--mid), var(--sy) + 0.02)) - var(--lead))
		);
		--fact-t: clamp(0, calc((var(--p) - var(--depart)) / (var(--arrive) - var(--depart))), 1);
		--fact-e: calc(var(--fact-t) * var(--fact-t) * (3 - 2 * var(--fact-t)));
		/* Span and colour arrive over the last stretch, as the chip settles into its slot. */
		--settle: clamp(0, calc((var(--fact-e) - 0.8) / 0.2), 1);
		transform: translate3d(
				calc((var(--sx) * 100cqw - 50%) * (1 - var(--fact-e)) + var(--fx) * var(--fact-e)),
				calc((var(--sy) + (var(--mid) - var(--sy)) * var(--fact-e)) * 100cqh - 50%),
				0
			)
			rotate(calc(var(--tilt) * (1 - var(--fact-e)) * 1deg))
			scale(calc(var(--shrink) + (1 - var(--shrink)) * var(--fact-e)));
	}

	/* Rank in mono, last name in Barlow Condensed: the row header it becomes. */
	.soldier {
		--fx: calc(var(--bx) + 0.25rem);
		gap: 0.45em;
		padding: 0.3rem 0.5rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1;
	}

	/* One chip per block: a one-column pill that grows to its span with scaleX while the label holds still. */
	.status {
		--fx: calc(var(--bx) + var(--namew) + var(--col) * var(--colw) + 1px);
		width: calc(var(--colw) - 2px);
		height: calc(var(--row-f) * 100cqh - 3px);
		padding-left: 0.3rem;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: color-mix(in oklch, var(--l-night-text) calc(var(--settle) * 100%), var(--l-ink));
	}

	.status::before {
		right: auto;
		width: calc(var(--span) * var(--colw) - 2px);
		background: color-mix(in oklch, var(--fill) calc(var(--settle) * 100%), var(--l-day));
		transform: scaleX(calc(1 / var(--span) + (1 - 1 / var(--span)) * var(--settle)));
		transform-origin: left;
	}

	/* Noise never lands: it shrinks and fades as the line reaches it. */
	.noise {
		--gone: clamp(0, calc((var(--p) - 0.59 - 0.3 * (1 - var(--sy))) / 0.03), 1);
		gap: 0.45em;
		padding: 0.3rem 0.5rem;
		font-size: 0.6875rem;
		line-height: 1;
		opacity: calc(var(--lit) * (1 - var(--gone)));
		transform: translate3d(calc(var(--sx) * 100cqw - 50%), calc(var(--sy) * 100cqh - 50%), 0)
			rotate(calc(var(--tilt) * 1deg)) scale(calc(var(--shrink) * (1 - 0.45 * var(--gone))));
	}

	@media (max-width: 640px) {
		.fact {
			--sx: var(--sx-p);
			--sy: var(--sy-p);
			--span: var(--span-p);
		}

		.wide-only {
			display: none;
		}
	}
</style>
