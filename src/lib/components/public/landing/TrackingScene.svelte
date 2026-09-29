<script lang="ts">
	import ScrollStage from '$lib/components/public/ScrollStage.svelte';
	import {
		calloutColumns,
		counts,
		readyPercent,
		roster,
		trainingTypes,
		type Currency
	} from './tracking/trainingMatrix';

	// Cells resolve in a diagonal wave: 0 at the top-left cell, 1 at the bottom-right.
	const lastDiagonal = roster.length + trainingTypes.length - 2;

	const legend: { status: Currency; label: string }[] = [
		{ status: 'current', label: 'Current' },
		{ status: 'expiring', label: 'Expiring' },
		{ status: 'expired', label: 'Expired' },
		{ status: 'none', label: 'Not recorded' }
	];

	// The readout and legend are drawn inside the illustration, so its label carries the same numbers.
	const matrixLabel = `Training matrix: ${roster.length} Soldiers by ${trainingTypes.length} training types, ${readyPercent} percent ready. ${counts.current} current, ${counts.expiring} expiring in 21 days, ${counts.expired} expired and ${counts.none} not recorded.`;
</script>

<section class="tracking">
	<div class="l-wrap tracking__layout">
		<div class="tracking__rail">
			<div class="tracking__copy">
				<p class="l-eyebrow tracking__eyebrow">Who's trained?</p>
				<h2 class="l-headline tracking__title">Every requirement. Every Soldier. Nothing lapses quietly.</h2>
				<p class="l-body">
					Set your training types and how long each one stays good. TroopToTask checks every Soldier against them and
					flags what's about to expire, not just what already has.
				</p>
			</div>
		</div>

		<ScrollStage length="240vh" stops={[0, 0.92]}>
			<div class="tracking__stage">
				<div class="matrix" role="img" aria-label={matrixLabel}>
					<div class="matrix__grid" aria-hidden="true">
						<span class="matrix__corner">Soldier</span>
						{#each trainingTypes as type (type)}
							<span class="matrix__type">{type}</span>
						{/each}
						<span class="matrix__group">1st Platoon</span>
						{#each roster as soldier, row (soldier.name)}
							<span class="matrix__soldier">
								<span class="matrix__rank">{soldier.rank}</span>
								<span class="matrix__name">{soldier.name}</span>
							</span>
							{#each soldier.cells as cell, col (col)}
								<span class="cell" data-status={cell.status} style:--d={(row + col) / lastDiagonal}>
									<span class="cell__unknown">&mdash;</span>
									{#if cell.status !== 'none'}
										<span class="cell__known">{cell.label}</span>
									{/if}
								</span>
							{/each}
						{/each}
						<!-- The score shares the callout's row, to the left of the bracketed columns. -->
						<span class="matrix__score" style:grid-column="1 / {calloutColumns.first + 2}">
							<span class="matrix__percent l-figures">{readyPercent}%</span>
							<span class="matrix__ready">Ready</span>
						</span>
						<span class="callout" style:grid-column="{calloutColumns.first + 2} / {calloutColumns.last + 3}">
							<span class="callout__bracket"></span>
							<span class="callout__tag">Expires in 21 days</span>
						</span>
						<span class="matrix__legend">
							{#each legend as item (item.status)}
								<span class="matrix__key" data-status={item.status}>
									<span class="matrix__swatch"></span>
									{item.label}
									<span class="matrix__count l-figures">{counts[item.status]}</span>
								</span>
							{/each}
						</span>
					</div>
				</div>
			</div>
		</ScrollStage>
	</div>
</section>

<style>
	.tracking {
		background: var(--l-day-sunk);
		border-top: 1px solid var(--l-day-line);
	}

	.tracking__layout {
		display: grid;
		grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
		column-gap: 2.5rem;
	}

	/* Copy and stage share one grid row, so the sticky copy pins and releases with the stage. */
	.tracking__copy {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 1.25rem;
		height: 100vh;
		height: 100svh;
		/* The top clears the fixed 56px nav. */
		padding-block: 4.5rem 2rem;
	}

	.tracking__eyebrow {
		color: var(--l-ink-muted);
	}

	/* Sized for the narrow text column beside the matrix. */
	.tracking .tracking__title {
		font-size: clamp(2.5rem, 3.9vw, 3.375rem);
	}

	/*
	 * Timeline in scroll progress: cells resolve across 0.10 to 0.60 (each cell has its own window),
	 * the readout settles over 0.58 to 0.68, and the expiring cells are called out over 0.65 to 0.85.
	 * Each window is declared on the element that uses it, so the other cells don't inherit and
	 * recompute it on every scroll frame.
	 */
	.tracking__stage {
		--hatch: color-mix(in oklch, var(--l-ink-muted) 24%, var(--l-day-sunk));
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		padding-block: 4.5rem 2rem;
	}

	[data-status='current'] {
		--fill: var(--l-current-fill);
		--ink: var(--l-current-ink);
	}

	[data-status='expiring'] {
		--fill: var(--l-expiring-fill);
		--ink: var(--l-expiring-ink);
	}

	[data-status='expired'] {
		--fill: var(--l-expired-fill);
		--ink: var(--l-expired-ink);
	}

	[data-status='none'] {
		--fill: var(--l-day-sunk);
		--ink: var(--l-ink-muted);
	}

	.matrix {
		padding: clamp(0.5rem, 1.6cqw, 1rem);
		border: 1px solid var(--l-day-line);
		border-radius: 4px;
		background: var(--l-day);
		contain: layout paint;
	}

	.matrix__grid {
		display: grid;
		grid-template-columns: minmax(0, 1.55fr) repeat(6, minmax(0, 1fr));
		gap: 2px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: clamp(0.5625rem, 1.65cqw, 0.8125rem);
		line-height: 1;
	}

	.matrix__corner,
	.matrix__type {
		align-self: end;
		padding-bottom: 0.7em;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.matrix__corner {
		padding-left: 0.4rem;
		color: var(--l-ink-muted);
	}

	.matrix__type {
		text-align: center;
		color: var(--l-ink);
	}

	.matrix__group {
		grid-column: 1 / -1;
		padding: 0.6em 0.4rem;
		background: var(--l-day-sunk);
		color: var(--l-ink-muted);
		font-weight: 500;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.matrix__soldier {
		display: flex;
		align-items: center;
		gap: 0.6em;
		min-width: 0;
		padding-inline: 0.4rem;
		white-space: nowrap;
	}

	.matrix__rank {
		min-width: 3ch;
		font-weight: 700;
	}

	.matrix__name {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(0.8125rem, 2.3cqw, 1.25rem);
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	/* Each cell eases from not recorded to its status inside its own window of the wave. */
	.cell {
		--start: calc(0.1 + var(--d) * 0.38);
		--t: clamp(0, calc((var(--p) - var(--start)) / 0.12), 1);
		--e: calc(var(--t) * var(--t) * (3 - 2 * var(--t)));
		--edge: color-mix(in oklch, var(--ink) 24%, var(--fill));
		position: relative;
		display: grid;
		place-items: center;
		height: clamp(1.625rem, 5.2cqh, 3rem);
		border: 1px solid color-mix(in oklch, var(--edge) calc(var(--e) * 100%), var(--l-day-line));
		border-radius: 2px;
		background: color-mix(in oklch, var(--fill) calc(var(--e) * 100%), var(--l-day-sunk));
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* Every cell starts here; cells with nothing on file stay here. */
	.cell[data-status='none'] {
		--e: 0;
	}

	.cell::before {
		content: '';
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(135deg, var(--hatch) 0 1px, transparent 1px 5px);
		opacity: calc(1 - var(--e));
	}

	.cell__unknown,
	.cell__known {
		position: relative;
		grid-area: 1 / 1;
	}

	/* The dash clears before the value arrives, so the two never read as a struck-through date. */
	.cell__unknown {
		color: var(--l-ink-muted);
		opacity: clamp(0, calc(1 - var(--e) * 3), 1);
	}

	.cell__known {
		color: var(--ink);
		opacity: clamp(0, calc((var(--e) - 0.3) / 0.7), 1);
	}

	.cell[data-status='expiring'] {
		--flag-t: clamp(0, calc((var(--p) - 0.65) / 0.07), 1);
		--flag: calc(var(--flag-t) * var(--flag-t) * (3 - 2 * var(--flag-t)));
	}

	.cell[data-status='expiring']::after {
		content: '';
		position: absolute;
		inset: -1px;
		border: 1px solid var(--l-expiring-ink);
		border-radius: 2px;
		opacity: var(--flag);
	}

	.callout {
		--bracket-t: clamp(0, calc((var(--p) - 0.69) / 0.08), 1);
		--bracket: calc(var(--bracket-t) * var(--bracket-t) * (3 - 2 * var(--bracket-t)));
		--tag-t: clamp(0, calc((var(--p) - 0.74) / 0.11), 1);
		--tag: calc(var(--tag-t) * var(--tag-t) * (3 - 2 * var(--tag-t)));
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 3px;
	}

	.callout__bracket {
		position: relative;
		align-self: stretch;
		height: 0.45rem;
		border: 1px solid var(--l-expiring-ink);
		border-top: 0;
		transform: scaleX(var(--bracket));
	}

	.callout__bracket::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		width: 1px;
		height: 0.45rem;
		background: var(--l-expiring-ink);
	}

	.callout__tag {
		margin-top: 0.45rem;
		padding: 0.4em 0.65em;
		border: 1px solid var(--l-expiring-ink);
		border-radius: 2px;
		background: var(--l-expiring-fill);
		color: var(--l-expiring-ink);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
		opacity: var(--tag);
		transform: translateY(calc((1 - var(--tag)) * -0.35rem));
	}

	.matrix__score,
	.matrix__legend {
		--settle-t: clamp(0, calc((var(--p) - 0.58) / 0.1), 1);
		--settle: calc(var(--settle-t) * var(--settle-t) * (3 - 2 * var(--settle-t)));
	}

	.matrix__score {
		display: flex;
		align-items: baseline;
		align-self: end;
		gap: 0.6em;
		padding: 0.75rem 0.4rem 0;
		opacity: var(--settle);
		transform: translateY(calc((1 - var(--settle)) * 0.5rem));
	}

	.matrix__percent {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.25rem, 6.5cqw, 3.25rem);
		font-weight: 700;
		line-height: 0.8;
	}

	.matrix__ready,
	.matrix__legend {
		color: var(--l-ink-muted);
		font-size: clamp(0.625rem, 0.9em, 0.75rem);
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.matrix__legend {
		grid-column: 1 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		margin-top: 0.6rem;
		padding: 0.7rem 0.4rem 0.1rem;
		border-top: 1px solid var(--l-day-line);
	}

	.matrix__key {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.matrix__swatch {
		width: 0.75rem;
		height: 0.75rem;
		border: 1px solid color-mix(in oklch, var(--ink) 24%, var(--fill));
		border-radius: 2px;
		background: var(--fill);
	}

	[data-status='none'] .matrix__swatch {
		border-color: var(--l-day-line);
		background: repeating-linear-gradient(135deg, var(--hatch) 0 1px, var(--l-day-sunk) 1px 4px);
	}

	.matrix__count {
		color: var(--l-ink);
		font-weight: 600;
		opacity: var(--settle);
	}

	@media (max-width: 899px) {
		.tracking__layout {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Phones read the copy first, then the matrix pins on its own. */
		.tracking__copy {
			position: static;
			height: auto;
			padding-block: clamp(5rem, 12vh, 9rem) 0;
		}
	}

	@container (max-width: 34rem) {
		.matrix__grid {
			grid-template-columns: minmax(0, 1.2fr) repeat(6, minmax(0, 1fr));
		}

		.matrix__soldier {
			flex-direction: column;
			align-items: flex-start;
			justify-content: center;
			gap: 0.2em;
		}

		.matrix__type,
		.cell {
			letter-spacing: 0;
		}

		.matrix__legend {
			display: grid;
			grid-template-columns: repeat(2, auto);
			justify-content: start;
		}
	}
</style>
