<script lang="ts">
	/** The four questions answered badly, broken into subtitle phrases. Each beat owns 0.11 of progress from 0.10. */
	const beats = [
		{ question: "Who's here?", lines: ['The roster in the spreadsheet', "isn't the roster on the whiteboard."] },
		{ question: "Who's trained?", lines: ["Training dates live in one person's head.", 'Until they PCS.'] },
		{ question: 'What does the commander need?', lines: ['The slide you built at 0200', 'is wrong by 0900.'] },
		{ question: "What's due?", lines: ['The NCOER was due two weeks ago.', 'Nobody flagged it.'] }
	];
	const thesis = ['The data was never', 'the problem.', 'Where it lived was.'];
</script>

<div class="hero">
	<p class="l-eyebrow hero__eyebrow">Yesterday</p>
	<h1 class="l-display hero__title"><span>Sunday, 2214.</span> <span>The brief is at 0900.</span></h1>
	<p class="l-body hero__sub">
		The roster is in one spreadsheet. Training dates are in another. The rest is in somebody's head. TroopToTask is the
		way out.
	</p>
	<p class="l-eyebrow hero__cue">Scroll to step off</p>
</div>

<div class="captions">
	{#each beats as beat, index (beat.question)}
		<div class="beat" style:--start={0.1 + index * 0.11}>
			<p class="l-eyebrow beat__question"><span class="bar">{beat.question}</span></p>
			<p class="beat__statement">
				{#each beat.lines as line, lineIndex (line)}
					{#if lineIndex > 0}
						<br />
					{/if}
					<span class="bar">{line}</span>
				{/each}
			</p>
		</div>
	{/each}
	<p class="thesis">
		{#each thesis as line, lineIndex (line)}
			{#if lineIndex > 0}
				<br />
			{/if}
			<span class="bar">{line}</span>
		{/each}
	</p>
</div>

<style>
	/* Night text holds the page's left edge: the camera never moves, the world changes under the text. */
	.hero,
	.captions {
		position: absolute;
		top: var(--nav-h);
		bottom: 0;
		left: var(--x0);
		width: var(--cw);
	}

	.hero {
		/* Leaves over p 0.05 to 0.10: fades and drifts up. */
		--leave: clamp(0, calc((var(--p) - 0.05) / 0.05), 1);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: flex-start;
		padding-bottom: 5cqh;
		color: var(--l-night-text);
		opacity: calc(1 - var(--leave));
		transform: translate3d(0, calc(var(--leave) * -3cqh), 0);
	}

	.hero__eyebrow,
	.hero__sub,
	.hero__cue {
		color: var(--l-night-muted);
	}

	.hero__title {
		margin-top: 1.25rem;
		font-size: clamp(3.25rem, min(10.5vw, 15cqh), 9.5rem);
	}

	.hero__title span {
		display: block;
	}

	.hero__sub {
		margin-top: 1.75rem;
	}

	.hero__cue {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 2.25rem;
	}

	/* A short amber tick: the phase line, foreshadowed. */
	.hero__cue::before {
		content: '';
		width: 1.5rem;
		height: 2px;
		background: var(--l-amber);
	}

	.captions {
		display: grid;
		align-content: center;
		padding-bottom: 2cqh;
	}

	.beat,
	.thesis {
		grid-area: 1 / 1;
		align-self: center;
	}

	/* In over the first 0.02 of the beat, out over its last 0.02, drifting up both ways. */
	.beat {
		--in: clamp(0, calc((var(--p) - var(--start)) / 0.02), 1);
		--out: clamp(0, calc((var(--p) - var(--start) - 0.09) / 0.02), 1);
		opacity: calc(var(--in) - var(--out));
		transform: translate3d(0, calc((1 - var(--in) - var(--out)) * 2.5cqh), 0);
	}

	/* The thesis arrives at 0.54 and fades out over 0.64 to 0.70, gone before the rising line reaches it. */
	.thesis {
		--in: clamp(0, calc((var(--p) - 0.54) / 0.02), 1);
		--out: clamp(0, calc((var(--p) - 0.64) / 0.06), 1);
		opacity: calc(var(--in) - var(--out));
		transform: translate3d(0, calc((1 - var(--in)) * 2.5cqh), 0);
	}

	/* Broadcast-subtitle bars: every wrapped line gets its own solid night bar over the pile. */
	.bar {
		background: var(--l-night);
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
	}

	/* Each bar's padding hangs into the gutter (negative margin), so the words, not the bars, hold the left edge. */
	.beat__question {
		margin: 0 0 1rem -0.7em;
		color: var(--l-night-muted);
	}

	.beat__question .bar {
		padding: 0.45em 0.7em;
	}

	.beat__statement,
	.thesis {
		margin-left: -0.16em;
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 700;
		letter-spacing: 0.005em;
		text-transform: uppercase;
		text-wrap: balance;
		color: var(--l-night-text);
	}

	.beat__statement {
		font-size: clamp(2rem, 4.5vw, 4.125rem);
		line-height: 1.26;
	}

	.thesis {
		font-size: clamp(2.5rem, 6vw, 5.5rem);
		line-height: 1.24;
	}

	.beat__statement .bar,
	.thesis .bar {
		padding: 0.01em 0.16em;
	}
</style>
