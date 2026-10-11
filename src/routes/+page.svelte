<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PublicShell from '$lib/components/public/PublicShell.svelte';
	import * as Accordion from '$lib/components/ui/accordion';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	let heroEl = $state<HTMLElement>();
	let navScrolled = $state(false);
	let revealEnabled = $state(false);

	const action = $derived(
		data.user
			? { href: resolve('/dashboard?show=all'), label: 'Go to Dashboard' }
			: { href: resolve('/auth/request-access'), label: 'Request Access' }
	);

	const labelClass = 'font-mono text-[0.6875rem] font-medium tracking-[0.12em] uppercase';
	const showcaseHeadingClass =
		'mt-3 font-heading text-[length:clamp(1.75rem,calc(3vw_+_0.5rem),2.75rem)] leading-[1.1] font-bold tracking-[0.02em]';
	const containerClass = 'mx-auto px-8 max-sm:px-5';
	const ctaClass =
		'rounded-lg border-0 px-7 py-[0.8rem] font-heading text-[1.0625rem] font-semibold tracking-[0.04em] uppercase';

	const faqs = [
		{
			question: 'Are the calendar statuses fixed, or can I define my own?',
			answer:
				'You define every status yourself: the name, the color, and whether it marks a day as a unit closure (like a training holiday or DONSA). If your unit has a status called "PDHA/PDHRA" or "Rear D," that\'s exactly what you\'ll see on the calendar. Your formation, your language.'
		},
		{
			question: 'Can I scope access so squad leaders only see their people?',
			answer:
				"Yes. When you invite someone to your organization, you can scope their access to a specific group. Group-scoped access can let leaders update statuses for their Soldiers and track training, but they won't see counseling records, onboarding checklists, or personnel data for anyone outside their group. They get exactly the visibility they need to do their job."
		},
		{
			question: 'I already have my roster in a spreadsheet. Do I have to re-enter everyone by hand?',
			answer:
				'Upload an Excel or CSV roster, map its columns to the right personnel fields, and review the rows before importing. Name, rank, MOS, section, and other roster details can come from your existing file.'
		},
		{
			question: 'What kind of training data can I track?',
			answer:
				"Anything your unit requires. You create training types and set their expiration and warning windows. TroopToTask then tracks every Soldier against them and color-codes the matrix for current, approaching expiration, and overdue records using each type's settings. You can mark Soldiers as exempt, track pass/fail or attendance, and export a training report for your briefing."
		},
		{
			question: 'Can I export data, or does everything stay locked inside the app?',
			answer:
				'You can export personnel rosters, training reports, and calendars to Excel. Calendar exports retain status colors; training reports include readable status labels. Independent sign-in rosters can be printed from the browser.'
		},
		{
			question: 'Is this secure enough for personnel data?',
			answer:
				'TroopToTask aligns to NIST 800-171 with AES-256 encryption at rest, TLS 1.2+ in transit, role-based access control with group scoping, and security-relevant audit logs for accountability and review. It is not authorized for classified information, but for the administrative and personnel data that runs your day-to-day operations, the controls are where they need to be.'
		}
	];

	const features = [
		{
			index: '02',
			label: 'TRAINING READINESS',
			heading: 'Every requirement. Every soldier. One view.',
			body: "Track certifications, ACFT scores, weapons quals, and mandatory training across your unit. Color-coded compliance shows what's current, expiring, and overdue without opening a single spreadsheet.",
			image: {
				src: '/product-screens/training report.jpg',
				alt: 'Training readiness dashboard showing compliance scores per training type with progress bars and group-level readiness comparisons'
			}
		},
		{
			index: '03',
			label: 'READINESS REPORTS',
			heading: 'The readiness picture your commander actually needs.',
			body: 'MOS-level readiness matrix, expiration cliff projections, and at-risk soldier call lists. Built for the training meeting, not the filing cabinet.',
			image: {
				src: '/product-screens/critical task report.jpg',
				alt: 'Critical task readiness report showing MOS-by-category matrix, 12-month trend chart, and 6-month expiration cliff projection'
			}
		},
		{
			index: '04',
			label: 'EVALUATION TRACKING',
			heading: 'Never miss another NCOER deadline.',
			body: 'Track rating chains, evaluation timelines, and submission status across the unit. Surface expired and expiring evaluations before they become the next Command Climate Survey finding.',
			image: {
				src: '/product-screens/rating scheme.jpg',
				alt: 'Rating scheme tracker showing NCOER status by rater chain with evaluation period dates and workflow stages'
			}
		},
		{
			index: '05',
			label: 'IN-PROCESSING',
			heading: "Onboarding that doesn't require a whiteboard.",
			body: 'Build checklist templates once. Every new arrival gets a tracked workflow with stage-by-stage visibility for every leader in the chain.',
			image: {
				src: '/product-screens/onboarding template.jpg',
				alt: 'Company in-processing template showing numbered checklist steps with paperwork stages and review gates'
			}
		}
	];

	const proofPoints = [
		{
			title: 'Replaces the whiteboard',
			text: "Statuses update in the system. No marker, no erasing, no confusion about what's current.",
			delay: ''
		},
		{
			title: 'Replaces the spreadsheet',
			text: 'One structured roster. Exports are format-ready. No reformatting for the S1.',
			delay: 'delay-60'
		},
		{
			title: 'Replaces the shared drive',
			text: 'Counselings, training records, and onboarding checklists in one permission-controlled location.',
			delay: 'delay-120'
		},
		{
			title: 'Replaces the handoff binder',
			text: 'Security-relevant audit logs give incoming leaders context from day one.',
			delay: 'delay-180'
		}
	];

	onMount(() => {
		let navObs: IntersectionObserver | undefined;
		let revealObs: IntersectionObserver | undefined;
		if (typeof IntersectionObserver === 'undefined') {
			const updateNav = () => (navScrolled = heroEl ? heroEl.getBoundingClientRect().bottom <= 57 : false);
			updateNav();
			// The public shell scrolls, not the window, and element scroll events do not bubble.
			document.addEventListener('scroll', updateNav, { capture: true, passive: true });
			window.addEventListener('hashchange', updateNav);
			window.addEventListener('resize', updateNav);
			return () => {
				document.removeEventListener('scroll', updateNav, { capture: true });
				window.removeEventListener('hashchange', updateNav);
				window.removeEventListener('resize', updateNav);
			};
		}

		if (heroEl) {
			navObs = new IntersectionObserver(([e]) => (navScrolled = !e.isIntersecting), {
				threshold: 0,
				rootMargin: '-57px 0px 0px 0px'
			});
			navObs.observe(heroEl);
		}

		if (window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? true) {
			revealObs = new IntersectionObserver(
				(entries, observer) => {
					for (const entry of entries) {
						if (!entry.isIntersecting) continue;
						(entry.target as HTMLElement).classList.add('revealed');
						observer.unobserve(entry.target);
					}
				},
				{ threshold: 0.08 }
			);
			for (const el of document.querySelectorAll('.reveal')) revealObs.observe(el);
			revealEnabled = true;
		}

		return () => {
			navObs?.disconnect();
			revealObs?.disconnect();
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

{#snippet indexedLabel(index: string, text: string)}
	<span class={[labelClass, 'text-muted-foreground']}>
		<span class="mr-[0.7em] text-accent-text tabular-nums">{index}</span>{text}
	</span>
{/snippet}

<PublicShell
	user={data.user}
	bodyClass={revealEnabled ? 'reveal-enabled' : ''}
	showClassificationBar={false}
	navOverlay={true}
	{navScrolled}
	showCta={false}
	showFaqLink
>
	<!-- ───────────────────────── HERO ───────────────────────── -->
	<section
		bind:this={heroEl}
		class="relative overflow-hidden bg-chrome pt-[calc(56px_+_clamp(4rem,9vh,8rem))] pb-[clamp(4rem,9vh,8rem)] text-chrome-text before:pointer-events-none before:absolute before:inset-0 before:bg-chrome-dots max-sm:pt-[calc(56px_+_2.5rem)] max-sm:pb-12"
	>
		<div class="relative mx-auto max-w-[900px] px-8 text-center max-sm:px-5">
			<div class="reveal">
				<div class={[labelClass, 'mb-5 text-accent']}>UNIT MANAGEMENT PLATFORM</div>
				<h1
					class="m-0 font-heading text-[length:clamp(3.5rem,calc(7vw_+_0.5rem),7rem)] leading-[0.92] font-extrabold tracking-[0.02em] text-balance uppercase max-lg:text-[length:clamp(3rem,8vw,5rem)]"
				>
					KNOW YOUR<br /><em class="font-light text-accent italic">FORMATION.</em>
				</h1>
				<p class="mx-auto mt-6 max-w-[44ch] text-[1.125rem] leading-[1.65] text-chrome-text-muted">
					TroopToTask replaces scattered spreadsheets and whiteboards with one structured system for personnel
					readiness, training compliance, and daily accountability.
				</p>
				<div class="mt-10 flex items-center justify-center gap-4 max-sm:flex-col max-sm:items-stretch">
					<Button href={action.href} variant="accent" size="none" class={ctaClass}>{action.label}</Button>
				</div>
				<div
					class="mt-8 flex flex-wrap items-center justify-center gap-3 font-mono text-[0.6875rem] tracking-[0.04em] text-chrome-text-muted"
				>
					<span>Reviewed access</span>
					<span class="inline-block size-[3px] rounded-full bg-accent/50" aria-hidden="true"></span>
					<span>Built for DoD</span>
					<span class="inline-block size-[3px] rounded-full bg-accent/50" aria-hidden="true"></span>
					<span>NIST 800-171 aligned</span>
				</div>
			</div>
		</div>
	</section>

	<!-- ──────────────────── PRODUCT SHOWCASE ──────────────────── -->
	<section class="bg-background py-[clamp(5rem,10vh,9rem)]">
		<div class={[containerClass, 'max-w-[1320px]']}>
			<div class="reveal mx-auto mb-[clamp(2.5rem,4vw,4rem)] max-w-[620px] text-center">
				{@render indexedLabel('01', 'AVAILABILITY AT A GLANCE')}
				<h2 class={[showcaseHeadingClass, 'text-balance']}>See your entire formation across weeks, not just today.</h2>
				<p class="mx-auto mt-4 max-w-[55ch] leading-[1.6] text-muted-foreground">
					The availability calendar shows every soldier's status across a rolling window. One look tells you who's here,
					who's not, and when they're back.
				</p>
			</div>
			<div
				class="reveal overflow-hidden rounded-lg border border-border shadow-[0_8px_40px] shadow-chrome-shadow delay-100"
			>
				<img
					src="/product-screens/calendar.jpg"
					alt="Availability calendar showing every soldier's leave, TDY, school, and appointment status across a month-long view organized by platoon"
					width="1280"
					height="740"
					loading="eager"
					class="block h-auto w-full"
				/>
			</div>
		</div>
	</section>

	<!-- ──────────────────── FEATURE HIGHLIGHTS ──────────────────── -->
	<section class="bg-background pt-[clamp(2rem,4vh,4rem)] pb-[clamp(5rem,10vh,9rem)]">
		<div class={[containerClass, 'flex max-w-[1200px] flex-col gap-[clamp(5rem,10vh,8rem)]']}>
			{#each features as feature, i (feature.index)}
				{@const reverse = i % 2 === 1}
				<div
					class={[
						'reveal grid items-center gap-[clamp(2rem,4vw,4rem)] max-lg:grid-cols-1 max-lg:gap-8',
						reverse ? 'grid-cols-[7fr_5fr]' : 'grid-cols-[5fr_7fr]'
					]}
				>
					<div class={[reverse && 'order-2 max-lg:order-none']}>
						{@render indexedLabel(feature.index, feature.label)}
						<h2
							class="mt-3 font-heading text-[length:clamp(1.5rem,calc(2.5vw_+_0.25rem),2.25rem)] leading-[1.12] font-bold tracking-[0.02em] text-balance"
						>
							{feature.heading}
						</h2>
						<p class="mt-4 max-w-[48ch] leading-[1.6] text-muted-foreground">{feature.body}</p>
					</div>
					<div class={[reverse && 'order-1 max-lg:order-none']}>
						<div class="overflow-hidden rounded-lg border border-border shadow-[0_4px_24px] shadow-chrome-shadow">
							<img
								src={feature.image.src}
								alt={feature.image.alt}
								width="1280"
								height="672"
								loading="lazy"
								class="block h-auto w-full"
							/>
						</div>
					</div>
				</div>
			{/each}
			<div class="reveal mx-auto max-w-[760px] border-y border-border p-[clamp(2rem,4vw,3rem)] text-center">
				<span class={[labelClass, 'text-accent-text']}>MORE IN THE SYSTEM</span>
				<h2 class={[showcaseHeadingClass, 'text-balance']}>And this is not the whole platform.</h2>
				<p class="mx-auto mt-4 max-w-[62ch] leading-[1.65] text-muted-foreground">
					Personnel records, permission-scoped access, exports, audit history, sign-in rosters, counseling support, and
					admin workflows are built into the same operating picture. The landing page only covers the workflows leaders
					ask about first.
				</p>
			</div>
		</div>
	</section>

	<!-- ──────────────────── SOCIAL PROOF ──────────────────── -->
	<section class="border-y border-border bg-muted py-[clamp(5rem,10vh,8rem)]">
		<div class={[containerClass, 'max-w-[1000px]']}>
			<div class="reveal">
				<div class="mb-3 font-heading text-[5rem] leading-[0.5] font-extrabold text-accent" aria-hidden="true">"</div>
				<blockquote
					class="m-0 font-body text-[length:clamp(1.25rem,calc(2vw_+_0.25rem),1.625rem)] leading-[1.6] font-normal text-pretty text-foreground italic"
				>
					The whiteboard gets erased. The shared drive is a mess. Someone always has a different version of the roster.
					TroopToTask is the one place every leader looks.
				</blockquote>
				<cite
					class="mt-6 block font-mono text-[0.75rem] font-medium tracking-[0.08em] text-muted-foreground uppercase not-italic"
					>Company Commander, Active Duty Infantry Unit</cite
				>
			</div>

			<div
				class="mt-[clamp(3rem,5vw,4rem)] grid grid-cols-4 gap-8 border-t border-border pt-[clamp(2.5rem,4vw,3.5rem)] max-lg:grid-cols-2 max-sm:grid-cols-1"
			>
				{#each proofPoints as point (point.title)}
					<div class={['reveal', point.delay]}>
						<h3 class="mb-2 font-heading text-[1rem] font-semibold tracking-[0.02em]">{point.title}</h3>
						<p class="m-0 text-[0.9375rem] leading-[1.5] text-muted-foreground">{point.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- ──────────────────── FAQ ──────────────────── -->
	<section class="bg-background py-[clamp(5rem,10vh,9rem)]" id="faq">
		<div class={[containerClass, 'max-w-[760px]']}>
			<div class="reveal mb-[clamp(2rem,4vw,3.5rem)] text-center">
				<span class={[labelClass, 'text-accent-text']}>FREQUENTLY ASKED</span>
				<h2 class={showcaseHeadingClass}>
					The questions people ask<br /><em class="font-light text-accent italic">before they hand over the roster.</em>
				</h2>
			</div>

			<Accordion.Root type="single">
				{#each faqs as faq, i (faq.question)}
					<Accordion.Item value={String(i)} class="reveal border-b border-border first:border-t">
						<Accordion.Trigger
							class="items-center gap-6 py-5 font-heading text-[1.125rem] leading-[1.3] font-semibold tracking-[0.02em] text-foreground hover:text-accent-text hover:no-underline"
						>
							{faq.question}
						</Accordion.Trigger>
						<Accordion.Content class="pb-6">
							<p class="m-0 max-w-[65ch] text-base leading-[1.65] text-muted-foreground">{faq.answer}</p>
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>
		</div>
	</section>

	<!-- ──────────────────── CTA ──────────────────── -->
	<section class="bg-chrome py-[clamp(5rem,12vh,9rem)] text-center text-chrome-text" id="cta">
		<div class={[containerClass, 'reveal max-w-[640px]']}>
			<span class={[labelClass, 'text-accent']}>GET STARTED</span>
			<h2
				class="mt-4 font-heading text-[length:clamp(2.5rem,calc(6vw_+_0.5rem),5rem)] leading-[0.92] font-extrabold tracking-[0.02em] uppercase max-sm:text-[length:clamp(2rem,10vw,3.5rem)]"
			>
				READY TO RUN<br /><em class="font-light text-accent italic">A TIGHTER UNIT?</em>
			</h2>
			<p class="mt-6 text-[1.125rem] leading-[1.65] text-chrome-text-muted">
				Request reviewed access for your unit. We work with you to configure your structure, import your roster, and
				train your team leads.
			</p>
			<div class="mt-10 flex flex-wrap justify-center gap-4 max-sm:flex-col max-sm:items-stretch">
				<Button href={action.href} variant="accent" size="none" class={ctaClass}>{action.label}</Button>
			</div>
			<div class="mt-6 font-mono text-[0.6875rem] tracking-[0.06em] text-chrome-text-muted">Reviewed access</div>
		</div>
	</section>
</PublicShell>
