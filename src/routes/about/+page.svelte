<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	const heroCopy =
		"I'm SSG Baddeley, an active duty Army NCO and the sole developer behind TroopToTask. I built it around the admin friction I've seen throughout a career working as a first-line leader, in the orderly room, deployed in the TOC, and as a Troop Clinic NCOIC.";

	const frictionCopy =
		'From role to role, the tools changed and technology improved, but the friction stayed familiar: scattered trackers, duplicated updates, unclear ownership, and too much time spent chasing information. Somewhere between the third broken spreadsheet and the fifth version of the same tracker, the idea stopped feeling optional.';

	const whyBuilt = [
		'The idea for TroopToTask first surfaced while I was deployed as Battle NCO, but high operational tempo and real-world missions took priority.',
		'Later, as NCOIC of a clinic running almost entirely on borrowed manpower, the same problem became impossible to ignore. Most personnel rotated through every few months, while the continuity staff was small and already carrying patient-care responsibilities. That meant constant in-processing and out-processing, clinic scheduling, training calendars, access requirements, training records, and competency packets all had to stay coordinated at the same time.',
		'The clinic made the problem obvious, but it was not unique to the clinic. I had seen the same pattern in line units and staff roles: people move, requirements change, and leaders are left piecing the picture together from disconnected trackers.',
		'TroopToTask came from that pattern. From doing the work, seeing the same friction repeat, and building the tool I kept wishing existed.'
	];

	const feedback = [
		'TroopToTask is independently built by me, not by a defense contractor or large corporate team. I think that matters because the product is shaped close to the problem. Feedback from leaders actively using TroopToTask across multiple Army locations directly influences what gets built, what gets simplified, and what needs to work better next.',
		'It is still evolving, but the direction is clear: reduce admin drag, keep important work visible, and help leaders spend less time chasing the same information through five different places.',
		'I will never forget walking into a brigade headquarters just in time to hear CSM Moran, then Command Sergeant Major of 1st Medical Brigade, tell his team, "Never lose sight of the fact that every decision we make in these meetings is executed by a Soldier."',
		'That idea has followed me from place to place and shaped the way I approach problems. TroopToTask is built for the leaders who have to make the plan work after the meeting ends.'
	];

	const notTroopToTask = [
		'TroopToTask is not an official Army system, a replacement for required systems of record, or a government-endorsed product.',
		'It is a practical coordination layer for the everyday work that happens around those systems: the handoffs, requirements, schedules, personnel changes, and follow-through that leaders still have to manage.'
	];
</script>

<svelte:head>
	<title>About - TroopToTask</title>
	<meta
		name="description"
		content="TroopToTask is independently built by SSG Baddeley around firsthand Army unit admin experience and feedback from leaders using the platform."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="TroopToTask" />
	<meta property="og:title" content="About TroopToTask" />
	<meta property="og:description" content="Built by someone who has lived the unit admin problem firsthand." />
</svelte:head>

<PublicShell user={data.user} active="about" bodyClass="about-page" showClassificationBar={false} showCta={false}>
	<section class="about-page__section about-page__section--hero">
		<div class="about-hero">
			<div class="about-hero__copy">
				<p class="about-kicker">About TroopToTask</p>
				<h1>Built by someone who has lived the problem firsthand.</h1>
				<p class="about-lead">{heroCopy}</p>
				<p>{frictionCopy}</p>
				<div class="about-actions">
					<a href={resolve('/')} class="about-button about-button--primary">See how TroopToTask works</a>
					<a href={resolve('/auth/request-access')} class="about-button about-button--secondary">Request access</a>
				</div>
			</div>

			<figure class="about-portrait">
				<img src={asset('/me.jpeg')} alt="SSG Baddeley, founder and sole developer of TroopToTask" />
				<figcaption>
					<span>SSG Baddeley</span>
					Active duty Army NCO, sole developer
				</figcaption>
			</figure>
		</div>
	</section>

	<section class="about-page__section">
		<div class="about-body">
			<article>
				<p class="about-section-label">Why I Built TroopToTask</p>
				{#each whyBuilt as paragraph (paragraph)}
					<p>{paragraph}</p>
				{/each}
			</article>

			<aside class="quote-panel">
				<p>"Never lose sight of the fact that every decision we make in these meetings is executed by a Soldier."</p>
				<span>CSM Moran, Command Sergeant Major of 1st Medical Brigade, retired</span>
			</aside>

			<article>
				<p class="about-section-label">Shaped By Real Feedback</p>
				{#each feedback as paragraph (paragraph)}
					<p>{paragraph}</p>
				{/each}
			</article>

			<section class="not-official">
				<p class="about-section-label">What TroopToTask Is Not</p>
				{#each notTroopToTask as paragraph (paragraph)}
					<p>{paragraph}</p>
				{/each}
			</section>
		</div>
	</section>
</PublicShell>

<style>
	:global(.about-page) {
		--about-bg: oklch(98.5% 0.001 106.423);
		--about-panel: oklch(97% 0.001 106.424);
		--about-ink: oklch(14.7% 0.004 49.25);
		--about-muted: oklch(44.4% 0.011 73.639);
		--about-line: oklch(92.3% 0.003 48.717);
		--about-accent: oklch(66.6% 0.179 58.318);
		background: var(--about-bg);
	}

	:global([data-theme='dark'] .about-page) {
		--about-bg: oklch(14.7% 0.004 49.25);
		--about-panel: oklch(20% 0.006 49.25);
		--about-ink: oklch(98.5% 0.001 106.423);
		--about-muted: oklch(76% 0.01 73.639);
		--about-line: oklch(31% 0.008 49.25);
	}

	.about-page__section {
		color: var(--about-ink);
	}

	.about-page__section--hero {
		padding: clamp(2.5rem, 5vw, 4.5rem) 1.5rem 0;
	}

	.about-hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
		gap: clamp(2rem, 6vw, 5rem);
		align-items: center;
		max-width: 1180px;
		margin: 0 auto;
	}

	.about-hero__copy {
		display: grid;
		gap: 1.35rem;
	}

	.about-hero__copy p {
		max-width: 66ch;
	}

	.about-kicker,
	.about-section-label {
		margin: 0 0 0.85rem;
		color: var(--about-accent);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	h1 {
		margin: 0;
		font-family: 'Barlow Condensed', sans-serif;
		line-height: 0.98;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	h1 {
		max-width: 12ch;
		font-size: clamp(3.35rem, 7.1vw, 6.35rem);
		font-weight: 800;
	}

	p {
		max-width: 72ch;
		margin: 0;
		color: var(--about-muted);
		font-size: clamp(1.02rem, 1.1vw, 1.16rem);
		line-height: 1.66;
	}

	p + p {
		margin-top: 1.1rem;
	}

	.about-lead {
		color: var(--about-ink);
		font-size: clamp(1.18rem, 1.6vw, 1.48rem);
		line-height: 1.5;
	}

	.about-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 2rem;
	}

	.about-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.5rem;
		padding: 0.62rem 1rem;
		border: 1px solid var(--about-line);
		border-radius: 6px;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		line-height: 1;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			background-color 160ms cubic-bezier(0.2, 0, 0, 1),
			border-color 160ms cubic-bezier(0.2, 0, 0, 1),
			color 160ms cubic-bezier(0.2, 0, 0, 1);
	}

	.about-button--primary {
		background: var(--about-ink);
		border-color: var(--about-ink);
		color: var(--about-bg);
	}

	.about-button--secondary {
		background: transparent;
		color: var(--about-ink);
	}

	.about-button:hover {
		border-color: var(--about-accent);
	}

	.about-button:focus-visible {
		outline: 2px solid var(--about-accent);
		outline-offset: 2px;
	}

	.about-portrait {
		margin: 0;
	}

	.about-portrait img {
		display: block;
		width: 100%;
		border: 1px solid var(--about-line);
		border-radius: 6px;
		aspect-ratio: 3 / 4;
		object-fit: cover;
		object-position: center 24%;
	}

	.about-portrait figcaption {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.85rem;
		color: var(--about-muted);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.05em;
		line-height: 1.35;
		text-transform: uppercase;
	}

	.about-portrait figcaption span {
		color: var(--about-ink);
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.04em;
	}

	.about-body {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(260px, 0.55fr);
		gap: clamp(2rem, 5vw, 4rem);
		max-width: 1040px;
		margin: clamp(4rem, 9vw, 7rem) auto 0;
		padding: 0 1.5rem 6rem;
	}

	.about-body article,
	.not-official {
		padding-top: 2rem;
		border-top: 1px solid var(--about-line);
	}

	.about-body article:nth-of-type(2) {
		grid-column: 1 / 2;
	}

	.quote-panel {
		align-self: start;
		grid-row: span 2;
		padding: 1.5rem;
		border: 1px solid var(--about-line);
		border-radius: 6px;
		background: var(--about-panel);
	}

	.quote-panel p {
		color: var(--about-ink);
		font-size: clamp(1.2rem, 2vw, 1.55rem);
		line-height: 1.38;
	}

	.quote-panel span {
		display: block;
		margin-top: 1.5rem;
		color: var(--about-muted);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.12em;
		line-height: 1.45;
		text-transform: uppercase;
	}

	.not-official {
		grid-column: 1 / -1;
	}

	@media (max-width: 920px) {
		.about-hero,
		.about-body {
			grid-template-columns: 1fr;
		}

		.quote-panel,
		.not-official,
		.about-body article:nth-of-type(2) {
			grid-column: auto;
			grid-row: auto;
		}
	}

	@media (max-width: 640px) {
		.about-page__section--hero,
		.about-body {
			padding-inline: 1rem;
		}

		h1 {
			font-size: clamp(3.2rem, 16vw, 4.8rem);
		}

		.about-actions {
			display: grid;
		}

		.about-button {
			width: 100%;
		}
	}
</style>
