<script lang="ts">
	import ScrollStage from '../ScrollStage.svelte';

	const schedule = [
		{ time: '0630', task: 'Check the whiteboard against the spreadsheet', instead: 'Lead PT' },
		{ time: '0800', task: 'Update the training tracker', instead: 'Walk the line with your NCOs' },
		{ time: '0900', task: 'Format the brief', instead: 'Give the brief' },
		{ time: '1000', task: 'Chase leave dates by text', instead: 'Counsel your Soldiers' },
		{ time: '1300', task: 'Reformat the roster for S-1', instead: 'Mentor your junior leaders' },
		{ time: '1730', task: 'Stay late to finish the slides', instead: 'Go home' }
	];

	/**
	 * Splits a task into words that know where the pen enters and leaves them,
	 * as fractions of the whole task, so one stroke can cross a wrapped line.
	 */
	function strokeWords(task: string) {
		const words = task.split(' ');
		let drawn = 0;
		return words.map((word, index) => {
			const text = index < words.length - 1 ? `${word} ` : word;
			const from = drawn / task.length;
			drawn += text.length;
			return { text, from, to: drawn / task.length };
		});
	}
</script>

<ScrollStage length="280vh" stops={[0, 0.95]}>
	<div class="hours">
		<div class="l-wrap hours__layout">
			<div class="hours__intro">
				<p class="l-eyebrow hours__eyebrow">Where do the hours go?</p>
				<h2 class="l-headline hours__title">Back to your Soldiers.</h2>
				<p class="l-body hours__body">
					TroopToTask doesn't lead your formation. It gets the paperwork out of the way so you can.
				</p>
			</div>

			<div class="hours__day">
				<div class="l-eyebrow hours__labels" aria-hidden="true">
					<span>Mon</span>
					<span>Off your plate</span>
					<span class="hours__label-instead">Instead</span>
				</div>
				<ol class="hours__rows" aria-label="Monday">
					{#each schedule as row, index (row.time)}
						<li class="hours__row" style:--i={index}>
							<span class="hours__time l-figures">{row.time}<span class="sr-only">,</span></span>
							<span class="hours__task"
								>{#each strokeWords(row.task) as word (word.from)}<span
										class="hours__word"
										style:--from={word.from}
										style:--to={word.to}>{word.text}</span
									>{/each}</span
							>
							<span class="sr-only">, replaced by</span>
							<span class="hours__instead">{row.instead}</span>
						</li>
					{/each}
				</ol>
			</div>
		</div>
	</div>
</ScrollStage>

<style>
	/*
	 * One idea: each admin task is struck through and its replacement rises
	 * beneath it, a row at a time, driven by the stage's inherited --p.
	 */
	.hours {
		/* Rows own consecutive windows of --each, starting at --first; Go home is underlined last. */
		--first: 0.07;
		--each: 0.13;
		--u0: clamp(0, calc((var(--p) - 0.86) / 0.06), 1);
		--u: calc(var(--u0) * var(--u0) * (3 - 2 * var(--u0)));

		display: grid;
		align-content: center;
		height: 100%;
		/* The fixed site nav covers the top 56px of the pinned frame. */
		padding-block: calc(3.5rem + clamp(1rem, 5cqh, 3rem)) clamp(1rem, 5cqh, 3rem);
		background: var(--l-day);
		color: var(--l-ink);
	}

	.hours__layout {
		display: grid;
		grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
		column-gap: clamp(2.5rem, 5vw, 4.5rem);
		align-items: start;
	}

	.hours__eyebrow,
	.hours__labels,
	.hours__body {
		color: var(--l-ink-muted);
	}

	.hours__title {
		margin-top: 1rem;
	}

	.hours__body {
		margin-top: 1.5rem;
	}

	/* Each row is a time slot: the task on the first line, what you do instead beneath it. */
	.hours__labels,
	.hours__row {
		display: grid;
		grid-template-columns: 3.75rem minmax(0, 1fr);
		column-gap: 1.25rem;
		padding-inline-start: 1rem;
	}

	.hours__label-instead,
	.hours__instead {
		grid-column: 2;
	}

	.hours__labels {
		row-gap: 0.4rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--l-ink);
	}

	.hours__rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.hours__row {
		/* Local time t runs 0 to 1 across this row's window; each beat is a smoothstep inside it. */
		--s: calc(var(--first) + var(--i) * var(--each));
		--t: clamp(0, calc((var(--p) - var(--s)) / var(--each)), 1);
		--on: clamp(0, calc(min(var(--t), 1 - var(--t)) * 25), 1);
		--k0: clamp(0, calc((var(--t) - 0.06) / 0.44), 1);
		--k: calc(var(--k0) * var(--k0) * (3 - 2 * var(--k0)));
		--d0: clamp(0, calc((var(--t) - 0.4) / 0.22), 1);
		--dim: calc(var(--d0) * var(--d0) * (3 - 2 * var(--d0)));
		--r0: clamp(0, calc((var(--t) - 0.46) / 0.38), 1);
		--r: calc(var(--r0) * var(--r0) * (3 - 2 * var(--r0)));

		position: relative;
		align-items: first baseline;
		padding-block: 0.85rem;
		border-bottom: 1px solid var(--l-day-line);
	}

	/* The active row's margin rule. */
	.hours__row::before {
		content: '';
		position: absolute;
		inset-block: 0.6rem;
		left: 0;
		width: 2px;
		background: var(--l-ink);
		opacity: var(--on);
	}

	.hours__time {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 500;
		letter-spacing: 0.04em;
	}

	.hours__task {
		font-size: 1.0625rem;
		line-height: 1.4;
		color: color-mix(in oklch, var(--l-ink-muted) calc(var(--dim) * 100%), var(--l-ink));
		text-wrap: pretty;
	}

	.hours__word {
		position: relative;
	}

	/* The pen: each word's share of one 2px stroke, drawn left to right in reading order. */
	.hours__word::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		/* Through the middle of the lowercase letters. */
		top: calc(56% - 1px);
		height: 2px;
		background: var(--l-ink);
		transform: scaleX(clamp(0, calc((var(--k) - var(--from)) / (var(--to) - var(--from))), 1));
		transform-origin: left;
	}

	.hours__instead {
		position: relative;
		justify-self: start;
		margin-top: 0.35rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.375rem, 0.9rem + 1.4vw, 2.25rem);
		font-weight: 700;
		line-height: 0.98;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		text-wrap: balance;
		opacity: var(--r);
		transform: translate3d(0, calc((1 - var(--r)) * 0.45em), 0);
	}

	/* The scene's one amber mark. */
	.hours__row:last-child .hours__instead::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -0.1em;
		height: 3px;
		background: var(--l-amber);
		transform: scaleX(var(--u));
		transform-origin: left;
	}

	@media (max-width: 899px) {
		.hours__layout {
			grid-template-columns: minmax(0, 1fr);
			row-gap: clamp(1.5rem, 4cqh, 2.5rem);
		}
	}

	@media (max-width: 699px) {
		.hours__labels,
		.hours__row {
			grid-template-columns: 2.75rem minmax(0, 1fr);
			column-gap: 0.875rem;
			padding-inline-start: 0.75rem;
		}

		.hours__row {
			padding-block: 0.7rem;
		}

		.hours__task {
			font-size: 0.9375rem;
			line-height: 1.35;
		}

		.hours__instead {
			margin-top: 0.25rem;
		}
	}

	/* Short frames, such as a phone with its browser bars showing: tighten the rhythm so the whole day fits. */
	@container (max-height: 760px) {
		.hours {
			padding-block: 4rem 0.5rem;
		}

		.hours__title {
			margin-top: 0.625rem;
		}

		.hours__body {
			margin-top: 0.875rem;
		}

		.hours__labels {
			row-gap: 0.25rem;
			padding-bottom: 0.5rem;
		}

		.hours__row {
			padding-block: 0.5rem;
		}

		.hours__instead {
			margin-top: 0.15rem;
		}
	}

	@container (max-width: 699px) and (max-height: 760px) {
		.hours__body {
			font-size: 1rem;
		}

		.hours__row {
			padding-block: 0.375rem;
		}

		.hours__task {
			font-size: 0.875rem;
		}

		.hours__instead {
			font-size: 1.25rem;
		}
	}
</style>
