<script lang="ts">
	import { statusKey, type Status } from './boardData';

	const legend = Object.entries(statusKey) as [Status, (typeof statusKey)[Status]][];
</script>

<div class="headline">
	<p class="l-eyebrow headline__question">Who's here?</p>
	<h2 class="l-headline headline__title">
		<span>One roster.</span> <span>Every Soldier.</span> <span>Every day.</span>
	</h2>
	<p class="l-body headline__body">
		Leave, school, TDY, appointments, field time. Set your own statuses and see the whole formation across weeks, not
		just today.
	</p>
	<dl class="legend">
		{#each legend as [status, { code, name }] (status)}
			<div class="legend__item">
				<dt class="legend__code" style:--fill="var(--l-status-{status})">{code}</dt>
				<dd>{name}</dd>
			</div>
		{/each}
	</dl>
</div>

<style>
	/* Wide frames: the text column, its eyebrow level with the board's top edge. */
	.headline {
		position: absolute;
		top: calc(var(--by-f) * 100cqh);
		left: var(--x0);
		width: calc(var(--cw) * 0.33);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.headline__question,
	.headline__body {
		color: var(--l-ink-muted);
	}

	.headline__title {
		margin-top: 1rem;
		font-size: clamp(2.5rem, 4.4vw, 4.25rem);
	}

	.headline__title span {
		display: block;
	}

	.headline__body {
		margin-top: 1.5rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.625rem 1.25rem;
		margin-top: 2.25rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		line-height: 1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.legend__item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend__code {
		padding: 0.3rem 0.4rem;
		border-radius: 2px;
		background: var(--fill);
		color: var(--l-night-text);
		font-weight: 600;
	}

	.legend dd {
		color: var(--l-ink-muted);
	}

	/* Stacked: headline on one line, body and legend side by side above the board. */
	@media (max-width: 1099px) {
		.headline {
			top: calc(var(--nav-h) + 2.5cqh);
			width: var(--cw);
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 17rem);
			column-gap: 2.5rem;
			align-items: end;
		}

		.headline__question,
		.headline__title {
			grid-column: 1 / -1;
		}

		.headline__title {
			margin-top: 0.75rem;
			font-size: clamp(2.25rem, 5.2vw, 4rem);
		}

		.headline__title span {
			display: inline;
		}

		.headline__body,
		.legend {
			margin-top: 1rem;
		}
	}

	@media (max-width: 640px) {
		.headline {
			top: calc(var(--nav-h) + 1.5rem);
			display: flex;
			align-items: flex-start;
		}

		.headline__title {
			font-size: 2.5rem;
		}

		.headline__title span {
			display: block;
		}

		.headline__body {
			margin-top: 0.75rem;
			font-size: 1rem;
			line-height: 1.5;
		}

		.legend {
			gap: 0.5rem 0.875rem;
			margin-top: 1rem;
			font-size: 0.625rem;
		}
	}
</style>
