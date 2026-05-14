<script lang="ts">
	import { onMount } from 'svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	let navScrolled = $state(false);
	let openFaq = $state(-1);

	const faqs = [
		{
			question: 'Are the calendar statuses fixed, or can I define my own?',
			answer:
				'You define every status yourself: the name, the color, and whether it marks a day as a unit closure (like a training holiday or DONSA). If your unit has a status called "PDHA/PDHRA" or "Rear D," that\'s exactly what you\'ll see on the calendar. Your formation, your language.'
		},
		{
			question: 'Can I scope access so squad leaders only see their people?',
			answer:
				"Yes. When you invite someone to your organization, you can scope their access to a specific group. A Team Leader role can update statuses for their Soldiers and track their training, but they won't see counseling records, onboarding checklists, or personnel data for anyone outside their group. They get exactly the visibility they need to do their job."
		},
		{
			question: 'I already have my roster in a spreadsheet. Do I have to re-enter everyone by hand?',
			answer:
				'The bulk import tool lets you paste your spreadsheet directly and walks you through mapping your columns to the right fields. Name, rank, MOS, section, assignment, whatever you have. You can be up and running with a full roster in a few minutes, not a few hours.'
		},
		{
			question: 'What kind of training data can I track?',
			answer:
				'Anything your unit requires. You create the training types and set an expiration window for each one. TroopToTask then tracks every Soldier against it and color-codes the matrix: green for current, yellow at 60 days, orange at 30, red for overdue. You can mark Soldiers as exempt, track pass/fail or attendance, and export the whole thing for your training briefing.'
		},
		{
			question: 'Can I export data, or does everything stay locked inside the app?',
			answer:
				"Both. The data lives in TroopToTask so it's always current, and you can pull it out whenever you need it. Personnel rosters, training matrices, and calendar exports all go to Excel with color-coding intact. Duty rosters and sign-in sheets are designed to print cleanly straight from the browser."
		},
		{
			question: 'Is this secure enough for personnel data?',
			answer:
				'TroopToTask aligns to NIST 800-171 with AES-256 encryption at rest, TLS 1.2+ in transit, role-based access control with group scoping, and a full audit log of every action (exportable for IG inspections). It is not authorized for classified information, but for the administrative and personnel data that runs your day-to-day operations, the controls are where they need to be.'
		}
	];

	onMount(() => {
		const heroEl = document.querySelector('.hero') as HTMLElement;
		let navObs: IntersectionObserver | undefined;
		if (heroEl) {
			navObs = new IntersectionObserver(([e]) => (navScrolled = !e.isIntersecting), {
				threshold: 0,
				rootMargin: '-57px 0px 0px 0px'
			});
			navObs.observe(heroEl);
		}

		const revealObs = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					(entry.target as HTMLElement).classList.add('revealed');
					revealObs.unobserve(entry.target);
				}
			},
			{ threshold: 0.08 }
		);
		for (const el of document.querySelectorAll('.reveal')) revealObs.observe(el);

		return () => {
			navObs?.disconnect();
			revealObs.disconnect();
		};
	});
</script>

<svelte:head>
	<title>TroopToTask — Unit Readiness, Organized</title>
	<meta
		name="description"
		content="TroopToTask replaces scattered spreadsheets, whiteboards, and shared-drive chaos with a structured digital workspace built for how units actually operate."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="TroopToTask" />
	<meta property="og:title" content="TroopToTask — Unit Readiness, Organized" />
	<meta
		property="og:description"
		content="Personnel tracking, accountability, training, onboarding, and readiness in one disciplined system."
	/>
	<meta property="og:url" content="https://trooptotask.org" />
	<meta property="og:image" content="https://trooptotask.org/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TroopToTask — Unit Readiness, Organized" />
	<meta name="twitter:description" content="A structured digital workspace built for how units actually operate." />
	<meta name="twitter:image" content="https://trooptotask.org/og-image.png" />
</svelte:head>

<PublicShell
	user={data.user}
	bodyClass="landing-redesign"
	showClassificationBar={false}
	navOverlay={true}
	{navScrolled}
	showCta={false}
	showFaqLink
	faqHref="#faq"
	roadmapHref="#cta"
>
	<!-- ───────────────────────── HERO ───────────────────────── -->
	<section class="hero">
		<div class="hero__container">
			<div class="hero__content reveal">
				<div class="hero__eyebrow">UNIT MANAGEMENT PLATFORM</div>
				<h1 class="hero__heading">
					KNOW YOUR<br /><em>FORMATION.</em>
				</h1>
				<p class="hero__body">
					TroopToTask replaces scattered spreadsheets and whiteboards with one structured system for personnel
					readiness, training compliance, and daily accountability.
				</p>
				<div class="hero__actions">
					<a href="/auth/request-access" class="btn-amber">Request Access</a>
					<a href="/features" class="btn-ghost">View Features</a>
				</div>
				<div class="hero__meta">
					<span>Free during beta</span>
					<span class="hero__meta-sep" aria-hidden="true"></span>
					<span>Built for DoD</span>
					<span class="hero__meta-sep" aria-hidden="true"></span>
					<span>NIST 800-171 aligned</span>
				</div>
			</div>

			<div class="hero__visual reveal" style="--reveal-delay: 0.15s">
				<div class="hero__frame">
					<div class="hero__frame-bar" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
					<img
						src="/product-screens/dashboard.jpg"
						alt="TroopToTask dashboard showing unit strength and availability, training status, duty roster, and items requiring attention"
						width="1280"
						height="672"
						loading="eager"
					/>
				</div>
			</div>
		</div>
	</section>

	<!-- ──────────────────── PRODUCT SHOWCASE ──────────────────── -->
	<section class="showcase">
		<div class="showcase__container">
			<div class="showcase__text reveal">
				<span class="section-label">AVAILABILITY AT A GLANCE</span>
				<h2 class="showcase__heading">See your entire formation across weeks, not just today.</h2>
				<p class="showcase__body">
					The availability calendar shows every soldier's status across a rolling window. One look tells you who's here,
					who's not, and when they're back.
				</p>
			</div>
			<div class="showcase__frame reveal" style="--reveal-delay: 0.1s">
				<img
					src="/product-screens/calendar.jpg"
					alt="Availability calendar showing every soldier's leave, TDY, school, and appointment status across a month-long view organized by platoon"
					width="1280"
					height="740"
					loading="eager"
				/>
			</div>
		</div>
	</section>

	<!-- ──────────────────── FEATURE HIGHLIGHTS ──────────────────── -->
	<section class="features">
		<div class="features__container">
			<div class="feature reveal">
				<div class="feature__content">
					<span class="section-label">TRAINING READINESS</span>
					<h2 class="feature__heading">Every requirement. Every soldier. One view.</h2>
					<p class="feature__body">
						Track certifications, ACFT scores, weapons quals, and mandatory training across your unit. Color-coded
						compliance shows what's current, expiring, and overdue without opening a single spreadsheet.
					</p>
				</div>
				<div class="feature__visual">
					<div class="feature__frame">
						<img
							src="/product-screens/training report.jpg"
							alt="Training readiness dashboard showing compliance scores per training type with progress bars and group-level readiness comparisons"
							width="1280"
							height="672"
							loading="lazy"
						/>
					</div>
				</div>
			</div>

			<div class="feature feature--reverse reveal">
				<div class="feature__content">
					<span class="section-label">READINESS REPORTS</span>
					<h2 class="feature__heading">The readiness picture your commander actually needs.</h2>
					<p class="feature__body">
						MOS-level readiness matrix, expiration cliff projections, and at-risk soldier call lists. Built for the
						training meeting, not the filing cabinet.
					</p>
				</div>
				<div class="feature__visual">
					<div class="feature__frame">
						<img
							src="/product-screens/critical task report.jpg"
							alt="Critical task readiness report showing MOS-by-category matrix, 12-month trend chart, and 6-month expiration cliff projection"
							width="1280"
							height="672"
							loading="lazy"
						/>
					</div>
				</div>
			</div>

			<div class="feature reveal">
				<div class="feature__content">
					<span class="section-label">EVALUATION TRACKING</span>
					<h2 class="feature__heading">Never miss another NCOER deadline.</h2>
					<p class="feature__body">
						Track rating chains, evaluation timelines, and submission status across the unit. Surface expired and
						expiring evaluations before they become the next Command Climate Survey finding.
					</p>
				</div>
				<div class="feature__visual">
					<div class="feature__frame">
						<img
							src="/product-screens/rating scheme.jpg"
							alt="Rating scheme tracker showing NCOER status by rater chain with evaluation period dates and workflow stages"
							width="1280"
							height="672"
							loading="lazy"
						/>
					</div>
				</div>
			</div>

			<div class="feature feature--reverse reveal">
				<div class="feature__content">
					<span class="section-label">IN-PROCESSING</span>
					<h2 class="feature__heading">Onboarding that doesn't require a whiteboard.</h2>
					<p class="feature__body">
						Build checklist templates once. Every new arrival gets a tracked workflow with stage-by-stage visibility for
						every leader in the chain.
					</p>
				</div>
				<div class="feature__visual">
					<div class="feature__frame">
						<img
							src="/product-screens/onboarding template.jpg"
							alt="Company in-processing template showing numbered checklist steps with paperwork stages and review gates"
							width="1280"
							height="672"
							loading="lazy"
						/>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ──────────────────── SOCIAL PROOF ──────────────────── -->
	<section class="proof">
		<div class="proof__container">
			<div class="proof__quote-block reveal">
				<div class="proof__mark" aria-hidden="true">"</div>
				<blockquote class="proof__quote">
					The whiteboard gets erased. The shared drive is a mess. Someone always has a different version of the roster.
					TroopToTask is the one place every leader looks.
				</blockquote>
				<cite class="proof__attribution">Company Commander, Active Duty Infantry Unit</cite>
			</div>

			<div class="proof__grid">
				<div class="proof__point reveal">
					<h3 class="proof__point-title">Replaces the whiteboard</h3>
					<p class="proof__point-text">
						Statuses update in the system. No marker, no erasing, no confusion about what's current.
					</p>
				</div>
				<div class="proof__point reveal" style="--reveal-delay: 0.06s">
					<h3 class="proof__point-title">Replaces the spreadsheet</h3>
					<p class="proof__point-text">One structured roster. Exports are format-ready. No reformatting for the S1.</p>
				</div>
				<div class="proof__point reveal" style="--reveal-delay: 0.12s">
					<h3 class="proof__point-title">Replaces the shared drive</h3>
					<p class="proof__point-text">
						Counselings, training records, and onboarding checklists in one permission-controlled location.
					</p>
				</div>
				<div class="proof__point reveal" style="--reveal-delay: 0.18s">
					<h3 class="proof__point-title">Replaces the handoff binder</h3>
					<p class="proof__point-text">Full audit log means incoming leaders have context from day one.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- ──────────────────── FAQ ──────────────────── -->
	<section class="faq" id="faq">
		<div class="faq__container">
			<div class="faq__header reveal">
				<span class="section-label">FREQUENTLY ASKED</span>
				<h2 class="faq__heading">
					The questions people ask<br /><em>before they hand over the roster.</em>
				</h2>
			</div>

			<div class="faq__list">
				{#each faqs as faq, i (faq.question)}
					<div class="faq__item reveal" class:open={openFaq === i}>
						<button
							class="faq__trigger"
							onclick={() => (openFaq = openFaq === i ? -1 : i)}
							aria-expanded={openFaq === i}
						>
							<span>{faq.question}</span>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="6 9 12 15 18 9"></polyline>
							</svg>
						</button>
						<div class="faq__answer">
							<div class="faq__answer-inner">
								<p>{faq.answer}</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ──────────────────── CTA ──────────────────── -->
	<section class="cta-final" id="cta">
		<div class="cta-final__container reveal">
			<span class="section-label section-label--light">GET STARTED</span>
			<h2 class="cta-final__heading">
				READY TO RUN<br /><em>A TIGHTER UNIT?</em>
			</h2>
			<p class="cta-final__body">
				Request free beta access for your unit. We work with you to configure your structure, import your roster, and
				train your team leads.
			</p>
			<div class="cta-final__actions">
				{#if data.user}
					<a href="/dashboard?show=all" class="btn-amber">Go to Dashboard</a>
				{:else}
					<a href="/auth/request-access" class="btn-amber">Request Access</a>
				{/if}
				<a href="/pricing" class="btn-ghost">View Pricing</a>
			</div>
			<div class="cta-final__meta">Free during beta · Paid plans later</div>
		</div>
	</section>
</PublicShell>

<style>
	/* ── Reveal Animation ── */
	:global(.reveal) {
		opacity: 0;
		transform: translateY(24px);
		transition:
			opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
		transition-delay: var(--reveal-delay, 0s);
	}

	:global(.reveal.revealed) {
		opacity: 1;
		transform: translateY(0);
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.reveal) {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}

	/* ── Section Label ── */
	.section-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent);
	}

	.section-label--light {
		color: oklch(76.9% 0.188 70.08);
	}

	/* ── Buttons ── */
	.btn-amber {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.8rem 1.75rem;
		border-radius: var(--radius-lg, 6px);
		background: oklch(76.9% 0.188 70.08);
		color: #12110f;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-decoration: none;
		text-transform: uppercase;
		border: none;
		transition:
			background-color 120ms cubic-bezier(0.2, 0, 0, 1),
			transform 120ms cubic-bezier(0.2, 0, 0, 1);
	}

	.btn-amber:hover {
		background: oklch(82% 0.17 70);
	}

	.btn-amber:active {
		transform: translateY(1px);
	}

	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.8rem 1.75rem;
		border-radius: var(--radius-lg, 6px);
		border: 1px solid oklch(100% 0 0 / 0.15);
		background: transparent;
		color: #f0efe9;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.0625rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-decoration: none;
		text-transform: uppercase;
		transition:
			background-color 120ms cubic-bezier(0.2, 0, 0, 1),
			border-color 120ms cubic-bezier(0.2, 0, 0, 1);
	}

	.btn-ghost:hover {
		background: oklch(100% 0 0 / 0.06);
		border-color: oklch(100% 0 0 / 0.3);
	}

	.btn-amber:focus-visible,
	.btn-ghost:focus-visible {
		outline: 2px solid oklch(76.9% 0.188 70.08);
		outline-offset: 2px;
	}

	/* ── Hero ── */
	.hero {
		position: relative;
		background: #12110f;
		color: #f0efe9;
		padding: calc(56px + clamp(4rem, 9vh, 8rem)) 0 clamp(4rem, 9vh, 8rem);
		overflow: hidden;
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: radial-gradient(oklch(100% 0 0 / 0.035) 1px, transparent 1px);
		background-size: 32px 32px;
		pointer-events: none;
	}

	.hero__container {
		position: relative;
		max-width: 1320px;
		margin: 0 auto;
		padding: 0 2rem;
		display: grid;
		grid-template-columns: 0.9fr 1.1fr;
		gap: clamp(2.5rem, 5vw, 5rem);
		align-items: center;
	}

	.hero__eyebrow {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: oklch(76.9% 0.188 70.08);
		margin-bottom: 1.25rem;
	}

	.hero__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(3.5rem, 7vw + 0.5rem, 7rem);
		font-weight: 800;
		line-height: 0.92;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		margin: 0;
		text-wrap: balance;
	}

	.hero__heading em {
		font-style: italic;
		font-weight: 300;
		color: oklch(76.9% 0.188 70.08);
	}

	.hero__body {
		margin-top: 1.5rem;
		font-size: 1.125rem;
		line-height: 1.65;
		color: #b0afa8;
		max-width: 44ch;
	}

	.hero__actions {
		margin-top: 2.5rem;
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.hero__meta {
		margin-top: 2rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.04em;
		color: #b0afa8;
	}

	.hero__meta-sep {
		display: inline-block;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: oklch(76.9% 0.188 70.08 / 0.5);
	}

	.hero__frame {
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid oklch(100% 0 0 / 0.07);
		box-shadow:
			0 0 80px oklch(66.6% 0.179 58.318 / 0.06),
			0 25px 60px oklch(0% 0 0 / 0.45);
	}

	.hero__frame-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		background: oklch(18% 0.004 49);
		border-bottom: 1px solid oklch(100% 0 0 / 0.04);
	}

	.hero__frame-bar span {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: oklch(28% 0.005 49);
	}

	.hero__frame img {
		display: block;
		width: 100%;
		height: auto;
	}

	/* ── Showcase ── */
	.showcase {
		padding: clamp(5rem, 10vh, 9rem) 0;
		background: var(--background);
	}

	.showcase__container {
		max-width: 1320px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.showcase__text {
		text-align: center;
		max-width: 620px;
		margin: 0 auto clamp(2.5rem, 4vw, 4rem);
	}

	.showcase__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.75rem, 3vw + 0.5rem, 2.75rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: 0.02em;
		margin: 0.75rem 0 0;
		text-wrap: balance;
	}

	.showcase__body {
		margin-top: 1rem;
		color: var(--muted-foreground);
		line-height: 1.6;
		max-width: 55ch;
		margin-inline: auto;
	}

	.showcase__frame {
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid var(--border);
		box-shadow: 0 8px 40px oklch(0% 0 0 / 0.06);
	}

	.showcase__frame img {
		display: block;
		width: 100%;
		height: auto;
	}

	/* ── Features ── */
	.features {
		padding: clamp(2rem, 4vh, 4rem) 0 clamp(5rem, 10vh, 9rem);
		background: var(--background);
	}

	.features__container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		display: flex;
		flex-direction: column;
		gap: clamp(5rem, 10vh, 8rem);
	}

	.feature {
		display: grid;
		grid-template-columns: 5fr 7fr;
		gap: clamp(2rem, 4vw, 4rem);
		align-items: center;
	}

	.feature--reverse {
		grid-template-columns: 7fr 5fr;
	}

	.feature--reverse .feature__content {
		order: 2;
	}

	.feature--reverse .feature__visual {
		order: 1;
	}

	.feature__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.5rem, 2.5vw + 0.25rem, 2.25rem);
		font-weight: 700;
		line-height: 1.12;
		letter-spacing: 0.02em;
		margin: 0.75rem 0 0;
		text-wrap: balance;
	}

	.feature__body {
		margin-top: 1rem;
		color: var(--muted-foreground);
		line-height: 1.6;
		max-width: 48ch;
	}

	.feature__frame {
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
		box-shadow: 0 4px 24px oklch(0% 0 0 / 0.04);
	}

	.feature__frame img {
		display: block;
		width: 100%;
		height: auto;
	}

	/* ── Social Proof ── */
	.proof {
		padding: clamp(5rem, 10vh, 8rem) 0;
		background: var(--muted);
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	.proof__container {
		max-width: 1000px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.proof__mark {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 5rem;
		font-weight: 800;
		line-height: 0.5;
		color: var(--accent);
		margin-bottom: 0.75rem;
	}

	.proof__quote {
		font-family: 'Source Serif 4', serif;
		font-size: clamp(1.25rem, 2vw + 0.25rem, 1.625rem);
		font-weight: 400;
		font-style: italic;
		line-height: 1.6;
		margin: 0;
		color: var(--foreground);
		text-wrap: pretty;
	}

	.proof__attribution {
		display: block;
		margin-top: 1.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		font-style: normal;
	}

	.proof__grid {
		margin-top: clamp(3rem, 5vw, 4rem);
		padding-top: clamp(2.5rem, 4vw, 3.5rem);
		border-top: 1px solid var(--border);
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2rem;
	}

	.proof__point-title {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		margin: 0 0 0.5rem;
	}

	.proof__point-text {
		font-size: 0.9375rem;
		color: var(--muted-foreground);
		line-height: 1.5;
		margin: 0;
	}

	/* ── FAQ ── */
	.faq {
		padding: clamp(5rem, 10vh, 9rem) 0;
		background: var(--background);
	}

	.faq__container {
		max-width: 760px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.faq__header {
		text-align: center;
		margin-bottom: clamp(2rem, 4vw, 3.5rem);
	}

	.faq__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(1.75rem, 3vw + 0.5rem, 2.75rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: 0.02em;
		margin: 0.75rem 0 0;
	}

	.faq__heading em {
		font-style: italic;
		font-weight: 300;
		color: var(--accent);
	}

	.faq__item {
		border-bottom: 1px solid var(--border);
	}

	.faq__item:first-child {
		border-top: 1px solid var(--border);
	}

	.faq__trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.25rem 0;
		background: none;
		border: none;
		cursor: pointer;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--foreground);
		text-align: left;
		line-height: 1.3;
		transition: color 120ms cubic-bezier(0.2, 0, 0, 1);
	}

	.faq__trigger:hover {
		color: var(--accent);
	}

	.faq__trigger:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.faq__trigger svg {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		color: var(--muted-foreground);
		transition: transform 240ms cubic-bezier(0.2, 0, 0, 1);
	}

	.faq__item.open .faq__trigger svg {
		transform: rotate(180deg);
	}

	.faq__answer {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 300ms cubic-bezier(0.25, 1, 0.5, 1);
	}

	.faq__item.open .faq__answer {
		grid-template-rows: 1fr;
	}

	.faq__answer-inner {
		overflow: hidden;
	}

	.faq__answer-inner p {
		margin: 0;
		padding-bottom: 1.5rem;
		color: var(--muted-foreground);
		line-height: 1.65;
		max-width: 65ch;
	}

	/* ── CTA Final ── */
	.cta-final {
		background: #12110f;
		color: #f0efe9;
		padding: clamp(5rem, 12vh, 9rem) 0;
		text-align: center;
	}

	.cta-final__container {
		max-width: 640px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.cta-final__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(2.5rem, 6vw + 0.5rem, 5rem);
		font-weight: 800;
		line-height: 0.92;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		margin: 1rem 0 0;
	}

	.cta-final__heading em {
		font-style: italic;
		font-weight: 300;
		color: oklch(76.9% 0.188 70.08);
	}

	.cta-final__body {
		margin-top: 1.5rem;
		font-size: 1.125rem;
		line-height: 1.65;
		color: #b0afa8;
	}

	.cta-final__actions {
		margin-top: 2.5rem;
		display: flex;
		gap: 1rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.cta-final__meta {
		margin-top: 1.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 400;
		letter-spacing: 0.06em;
		color: #b0afa8;
	}

	/* ── Responsive ── */
	@media (max-width: 1024px) {
		.hero__container {
			grid-template-columns: 1fr;
			gap: 3rem;
		}

		.hero__visual {
			max-width: 680px;
		}

		.hero__heading {
			font-size: clamp(3rem, 8vw, 5rem);
		}

		.feature,
		.feature--reverse {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.feature--reverse .feature__content,
		.feature--reverse .feature__visual {
			order: unset;
		}

		.proof__grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.hero {
			padding-top: calc(56px + 2.5rem);
			padding-bottom: 3rem;
		}

		.hero__container,
		.showcase__container,
		.features__container,
		.proof__container,
		.faq__container,
		.cta-final__container {
			padding-inline: 1.25rem;
		}

		.hero__actions {
			flex-direction: column;
			align-items: stretch;
		}

		.hero__meta {
			justify-content: center;
		}

		.proof__grid {
			grid-template-columns: 1fr;
		}

		.cta-final__actions {
			flex-direction: column;
			align-items: stretch;
		}

		.cta-final__heading {
			font-size: clamp(2rem, 10vw, 3.5rem);
		}
	}
</style>
