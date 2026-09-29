<!--
	PL AMBER. Rides `--line` (set on the stage frame) from the bottom edge to the top.
	Above it is yesterday, below it today.
-->
<div class="line" aria-hidden="true">
	<span class="ticks"></span>
	<span class="rule"></span>
	<span class="label label--above">Yesterday</span>
	<span class="tag">PL Amber</span>
	<span class="label label--below">Today</span>
</div>

<style>
	.line {
		/* The ticks and the tag peek in at the bottom edge from p 0.54, before the line starts to rise. */
		--peek: clamp(0, calc((var(--p) - 0.54) / 0.08), 1);
		/* The label hangs in the page gutter when there is room, otherwise it rides the frame's edge. */
		--label-x: max(0.75rem, calc(var(--x0) - 7rem));
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 0;
		pointer-events: none;
		transform: translate3d(0, calc(var(--line) * 100cqh + (1 - var(--peek)) * 3.5rem), 0);
	}

	.rule {
		position: absolute;
		top: -1px;
		left: 0;
		width: 100%;
		height: 2px;
		background: var(--l-amber);
	}

	/* Ruler ticks on the night side, one per board day with a half tick between, so the ruler lines up with the grid it lays down. */
	.ticks {
		position: absolute;
		bottom: 1px;
		left: 0;
		width: 100%;
		height: 0.5rem;
		background:
			linear-gradient(to right, var(--l-amber) 1px, transparent 1px) calc(var(--bx) + var(--namew)) 100% / var(--colw)
				100% repeat-x,
			linear-gradient(to right, var(--l-amber) 1px, transparent 1px) calc(var(--bx) + var(--namew) + var(--colw) / 2)
				100% / var(--colw) 45% repeat-x;
	}

	.tag,
	.label {
		position: absolute;
		left: var(--label-x);
		padding: 0.3rem 0.55rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		line-height: 1;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	/* The tag sits on the rule, like a label on a map overlay. */
	.tag {
		bottom: 1px;
		border-radius: 2px 2px 0 0;
		background: var(--l-amber);
		color: var(--l-ink);
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.label--above {
		bottom: 1.75rem;
		background: var(--l-night);
		color: var(--l-night-muted);
	}

	.label--below {
		top: 0.5rem;
		background: var(--l-day);
		color: var(--l-ink-muted);
	}

	/* Stacked layouts put the board's name column on the left edge; keep the label off the names as they land. */
	@media (max-width: 1099px) {
		.tag,
		.label {
			left: auto;
			right: var(--label-x);
		}
	}
</style>
