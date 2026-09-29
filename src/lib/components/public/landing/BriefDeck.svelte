<script lang="ts">
	import { asset } from '$app/paths';
	import ScrollStage from '$lib/components/public/ScrollStage.svelte';

	/*
	 * `focus` crops each screen to the region that proves its caption: the screen is drawn at `zoom` times its
	 * source scale, so the app's text stays legible, with source pixel (`x`, `y`) at the frame's top-left corner.
	 */
	const slides = [
		{
			name: 'Availability',
			caption: "Who's here, who's out, and when they're back.",
			src: asset('/product-screens/calendar.jpg'),
			width: 1708,
			height: 994,
			focus: { x: 0, y: 0, zoom: 0.8 },
			alt: 'Availability calendar: a platoon by day across April, with field, school, leave and appointment blocks.'
		},
		{
			name: 'Training',
			caption: "What's current, what's expiring, by group.",
			src: asset('/product-screens/training report.jpg'),
			width: 1730,
			height: 908,
			focus: { x: 0, y: 0, zoom: 0.8 },
			alt: 'Training readiness report: percent current across the unit, filters by platoon, rank, MOS and duty role, and expired and expiring counts for each training type.'
		},
		{
			name: 'Critical tasks',
			caption: 'Readiness by MOS, the trend, and what lapses next.',
			src: asset('/product-screens/critical task report.jpg'),
			width: 1724,
			height: 1003,
			focus: { x: 0, y: 0, zoom: 0.8 },
			alt: 'Critical task readiness: the readiness summary beside a matrix of MOS by task category.'
		},
		{
			name: 'Evaluations',
			caption: "Rating chains, due dates, and what's expiring.",
			src: asset('/product-screens/rating scheme.jpg'),
			width: 1666,
			height: 842,
			focus: { x: 0, y: 0, zoom: 0.9 },
			alt: 'Rating scheme: NCOERs grouped by senior rater and rater, each with its evaluation type and workflow status.'
		}
	];

	/** Scroll progress at which each flip is half done. */
	const flips = [0.22, 0.47, 0.72];

	// Each screen enters at the flip before it and leaves at the flip after it; -1 and 2 fall outside the runway.
	const screens = slides.map((slide, index) => ({ ...slide, enter: flips[index - 1] ?? -1, leave: flips[index] ?? 2 }));

	let active = $state(0);

	function track(progress: number) {
		const shown = flips.filter((flip) => progress >= flip).length;
		if (shown !== active) active = shown;
	}
</script>

<section class="deck">
	<div class="deck__layout">
		<div class="deck__rail">
			<div class="deck__copy">
				<p class="l-eyebrow deck__eyebrow">What does the commander need?</p>
				<h2 class="l-headline deck__title">The brief is already built.</h2>
				<p class="l-body">
					Availability, training, critical-task readiness and evaluations, always current and filterable by group. Brief
					from the screen, or export to Excel when somebody wants the file.
				</p>
				<ol class="deck__agenda">
					{#each slides as slide, index (slide.name)}
						<li class={{ 'is-active': index === active }}>{slide.name}</li>
					{/each}
				</ol>
			</div>
		</div>

		<ScrollStage length="320vh" onprogress={track} stops={[0, 0.345, 0.595, 0.9]}>
			<div class="deck__stage">
				<figure class="deck__figure">
					<div class="deck__frame">
						<div class="deck__bar">
							<span>Command &amp; staff brief</span>
							<span class="l-figures">MON 0900</span>
						</div>
						<div class="deck__screen">
							{#each screens as screen, index (screen.name)}
								<div class="deck__slide" style:--leave={screen.leave} style:z-index={screens.length - index}>
									<img
										class="deck__shot"
										src={screen.src}
										alt={screen.alt}
										width={screen.width}
										height={screen.height}
										loading="lazy"
										decoding="async"
										style:--nw={screen.width}
										style:--nh={screen.height}
										style:--x={screen.focus.x}
										style:--y={screen.focus.y}
										style:--zoom={screen.focus.zoom}
									/>
								</div>
							{/each}
						</div>
					</div>
					<figcaption class="deck__caption">
						<span class="deck__count l-figures" aria-hidden="true">{active + 1} / {slides.length}</span>
						<span class="deck__lines">
							{#each screens as screen (screen.name)}
								<span class="deck__line" style:--enter={screen.enter} style:--leave={screen.leave}
									>{screen.caption}</span
								>
							{/each}
						</span>
					</figcaption>
				</figure>
				<p class="deck__footnote">Screens from the app.</p>
			</div>
		</ScrollStage>
	</div>
</section>

<style>
	.deck {
		background: var(--l-day);
		border-top: 1px solid var(--l-day-line);
	}

	/* The copy starts on the same edge as `.l-wrap`; the stage runs to the viewport's right edge. */
	.deck__layout {
		display: grid;
		grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
		column-gap: 2.5rem;
		padding-left: max(var(--l-gutter), calc((100% - var(--l-wrap-max)) / 2 + var(--l-gutter)));
	}

	/* Copy and stage share one grid row, so the sticky copy pins and releases with the stage. */
	.deck__copy {
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

	.deck__eyebrow {
		color: var(--l-ink-muted);
	}

	/* Sized for the narrow text column beside the stage. */
	.deck .deck__title {
		font-size: clamp(2.5rem, 3.9vw, 3.375rem);
	}

	.deck__agenda {
		max-width: 22rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
		counter-reset: slide;
	}

	.deck__agenda li {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 0.9rem;
		padding: 0.6rem 0 0.6rem 0.9rem;
		border-top: 1px solid var(--l-day-line);
		color: var(--l-ink-muted);
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.375rem;
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		counter-increment: slide;
		transition: color var(--transition-fast);
	}

	.deck__agenda li:last-child {
		border-bottom: 1px solid var(--l-day-line);
	}

	.deck__agenda li::before {
		content: counter(slide, decimal-leading-zero);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
	}

	.deck__agenda li.is-active {
		color: var(--l-ink);
	}

	/* The scene's one amber mark: the agenda item on screen now. */
	.deck__agenda li.is-active::after {
		content: '';
		position: absolute;
		top: 0.6rem;
		bottom: 0.6rem;
		left: 0;
		width: 2px;
		background: var(--l-amber);
	}

	.deck__stage {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.6rem;
		height: 100%;
		padding-block: 4.5rem 2rem;
	}

	/* Short viewports: keep the whole frame, caption and footnote on screen. */
	.deck__figure {
		width: min(100%, calc((100cqh - 14rem) * 1.7778));
	}

	.deck__frame {
		overflow: clip;
		border: 1px solid var(--l-night);
		border-radius: 4px;
		background: var(--l-day);
	}

	.deck__bar {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.55rem 0.9rem;
		background: var(--l-night);
		color: var(--l-night-text);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		line-height: 1.2;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.deck__screen {
		position: relative;
		aspect-ratio: 16 / 9;
		overflow: clip;
		container-type: size;
	}

	/*
	 * Screens stack with the current one on top. At its flip it slides up out of the frame, uncovering the next
	 * one already in place underneath, so the frame is never blank and never double-exposed. The slide is 1px
	 * taller than the frame, so its bottom rule (the peeling edge) only shows while it moves.
	 */
	.deck__slide {
		--peel-t: clamp(0, calc((var(--p) - var(--leave) + 0.05) / 0.1), 1);
		--peel: calc(var(--peel-t) * var(--peel-t) * (3 - 2 * var(--peel-t)));
		position: absolute;
		inset: 0 0 -1px;
		overflow: clip;
		border-bottom: 1px solid var(--l-night);
		background: var(--l-day);
		transform: translate3d(0, calc(var(--peel) * -100%), 0);
	}

	/* Drawn at `--zoom` times source scale from source pixel (--x, --y), but never smaller than the frame. */
	.deck__shot {
		--w: max(
			calc(var(--nw) * var(--zoom) * 1px),
			calc(100cqw * var(--nw) / (var(--nw) - var(--x))),
			calc(100cqh * var(--nw) / (var(--nh) - var(--y)))
		);
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		width: var(--w);
		max-width: none;
		height: auto;
		transform: translate(calc(var(--x) * var(--w) / var(--nw) * -1), calc(var(--y) * var(--w) / var(--nw) * -1));
	}

	.deck__caption {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-top: 0.9rem;
	}

	.deck__count,
	.deck__footnote {
		color: var(--l-ink-muted);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.deck__count {
		flex: none;
		min-width: 5ch;
	}

	.deck__lines {
		display: grid;
	}

	/*
	 * Captions cut at the flip point (progress >= flip, like the agenda and the counter) so the three always
	 * agree; the peel carries the motion. `--p` has four decimals, so a step of 0.0001 flips the switch.
	 */
	.deck__line {
		--in: clamp(0, calc((var(--p) - var(--enter)) * 10000 + 1), 1);
		--out: clamp(0, calc((var(--p) - var(--leave)) * 10000 + 1), 1);
		grid-area: 1 / 1;
		font-size: clamp(1.0625rem, 0.95rem + 0.4vw, 1.25rem);
		line-height: 1.4;
		opacity: calc(var(--in) * (1 - var(--out)));
	}

	@media (min-width: 900px) {
		/* The frame runs off the right edge of the viewport. */
		.deck__frame {
			border-right: 0;
			border-radius: 4px 0 0 4px;
		}

		.deck__bar,
		.deck__caption,
		.deck__footnote {
			padding-right: var(--l-gutter);
		}
	}

	@media (max-width: 899px) {
		.deck__layout {
			grid-template-columns: minmax(0, 1fr);
			padding-right: var(--l-gutter);
		}

		/* Phones read the copy first, then the deck pins on its own. */
		.deck__copy {
			position: static;
			height: auto;
			padding-block: clamp(5rem, 12vh, 9rem) 0;
		}

		/* A tall screen (up to 4:5) fills the pinned phone viewport; short viewports give height back to the caption. */
		.deck__screen {
			aspect-ratio: auto;
			height: min(125cqw, 100cqh - 16rem);
		}
	}
</style>
