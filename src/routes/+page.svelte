<script lang="ts">
	import { onMount } from 'svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();

	let previewDate = $state('MON 0600 — MORNING ACCOUNTABILITY');
	let rosterDate = $state('Loading...');

	const faqs = [
		{
			question: 'Are the calendar statuses fixed — like "Leave" or "TDY" — or can I change them?',
			answer:
				'Absolutely not — customizing statuses is usually one of the first things a new unit admin does. You define every status yourself: the name, the color, and whether it marks a day as a unit closure (like a training holiday or DONSA). If your unit has a status called "PDHA/PDHRA" or "Rear D," that\'s exactly what you\'ll see on the calendar. Your formation, your language.'
		},
		{
			question:
				"I want my squad leaders to manage their people without seeing everyone else's business. Is that possible?",
			answer:
				"Yes — and this is one of the most powerful things T2T does. When you invite someone to your organization, you can scope their access to a specific group. A Team Leader role can update statuses for their Soldiers and track their training, but they won't see counseling records, onboarding checklists, or personnel data for anyone outside their group. They get exactly the visibility they need to do their job, and nothing they shouldn't have."
		},
		{
			question: 'I already have my roster in a spreadsheet. Do I have to re-enter everyone by hand?',
			answer:
				"Please don't. T2T's bulk import tool lets you paste your spreadsheet directly and walks you through mapping your columns to the right fields — name, rank, MOS, section, assignment, whatever you have. You can be up and running with a full roster in a few minutes, not a few hours. If your spreadsheet is a mess, the column mapper is forgiving enough to handle it."
		},
		{
			question: 'What is the "Leaders Book" and when is it coming back?',
			answer:
				"The Leaders Book is a digital replacement for that notebook every NCO keeps in their left cargo pocket — counseling records, development goals, extended soldier info, and everything else that doesn't have a home on a standard form. We're currently rebuilding it from the ground up to be more intuitive and better integrated with the rest of the app. The Rating Scheme tracker is fully available from Evals in the meantime."
		},
		{
			question: 'How does the duty roster generator actually work?',
			answer:
				"It runs the same logic that's supposed to be behind a DA Form 6 — fair rotation based on availability, eligibility, and how many times each person has already pulled the duty — without the hours of manual cross-referencing. You set who's eligible (rank requirements, exemptions, availability), and T2T builds the roster and tracks cumulative duty counts so the same three Soldiers aren't always on the list. The output is print-ready for the board or shareable digitally with your HQ."
		},
		{
			question: 'What kind of training data can I track?',
			answer:
				'Anything your unit requires. You create the training types — Weapons Qual, ACFT, CPR/BLS, SHARP, you name it — and set an expiration window for each one. T2T then tracks every Soldier against it and color-codes the matrix: green for current, yellow at 60 days, orange at 30, red for overdue. You can mark individual Soldiers as exempt, track pass/fail or just attendance, and export the whole thing to Excel for your training briefing. No more digging through a shared drive full of outdated spreadsheets.'
		},
		{
			question: "What does the in-processing checklist actually do that a shared doc can't?",
			answer:
				'It turns your in-processing SOP into a living workflow. Build a template once — equipment issue, clearing finance, initial counseling, ID card appointment, whatever your steps are — and every new arrival gets their own checklist generated from that template automatically. You can see progress by person ("where is SGT Johnson in the process?") or pivot and view it by step ("who across the whole platoon hasn\'t done their initial counseling?"). No more chasing people down the hallway trying to piece together who\'s done what.'
		},
		{
			question: 'Can I manage more than one unit from the same account?',
			answer:
				"Yes. One login, multiple organizations — and you can switch between them without signing out. Whether you're managing a company and a detachment, you're in a higher HQ role overseeing subordinate units, or you just PCS'd and want to keep your old organization's data accessible during the transition, everything lives under the same account."
		},
		{
			question: 'Can I export data, or does everything stay locked inside the app?',
			answer:
				"Both — the data lives in T2T so it's always current, and you can pull it out whenever you need it. Personnel rosters, training matrices, and calendar exports all go to Excel with color-coding intact. Duty rosters and sign-in sheets are designed to print cleanly straight from the browser. If the XO walks in and wants a personnel readiness brief, you have it in about 30 seconds."
		},
		{
			question: 'Is this secure enough to hold personal information about my Soldiers?',
			answer:
				'T2T is built to a military standard, not a startup standard. It aligns to NIST 800-171 — the federal framework for protecting Controlled Unclassified Information — with AES-256 encryption at rest, TLS 1.2+ in transit, role-based access control with group scoping, and a full audit log of every action in the system (exportable for IG inspections). T2T is not authorized for classified information, but for the administrative and personnel data that runs your day-to-day operations, the controls are where they need to be.'
		}
	];

	function formatMilDate(d: Date) {
		const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
		const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
		const h = d.getHours().toString().padStart(2, '0');
		const m = d.getMinutes().toString().padStart(2, '0');
		return `${days[d.getDay()]} ${h}${m}L — ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
	}

	onMount(() => {
		const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
		const d = new Date();
		const h = d.getHours().toString().padStart(2, '0');
		const m = d.getMinutes().toString().padStart(2, '0');

		previewDate = `${days[d.getDay()]} ${h}${m} — MORNING ACCOUNTABILITY`;
		rosterDate = formatMilDate(d);

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					const el = entry.target as HTMLElement;
					el.style.opacity = '1';
					el.style.transform = 'translateY(0)';
					observer.unobserve(el);
				}
			},
			{ threshold: 0.08 }
		);

		for (const [index, el] of Array.from(document.querySelectorAll<HTMLElement>('.observe-in')).entries()) {
			el.style.opacity = '0';
			el.style.transform = 'translateY(10px)';
			el.style.transition = `opacity 0.4s ease ${index * 0.04}s, transform 0.4s ease ${index * 0.04}s`;
			observer.observe(el);
		}

		return () => observer.disconnect();
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
		content="Command clarity, every formation. Personnel tracking, accountability, training, onboarding, and readiness in one disciplined system."
	/>
	<meta property="og:url" content="https://trooptotask.org" />
	<meta property="og:image" content="https://trooptotask.org/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="TroopToTask — Unit Readiness, Organized" />
	<meta
		name="twitter:description"
		content="A structured digital workspace built for how units actually operate — from morning accountability to end-of-cycle reporting."
	/>
	<meta name="twitter:image" content="https://trooptotask.org/og-image.png" />
</svelte:head>

<PublicShell
	user={data.user}
	bodyClass="landing-redesign"
	roadmapHref="#roadmap"
	faqHref="#faq"
	showFaqLink
	showCta={false}
>
	<section class="hero">
		<div class="container">
			<div class="hero__grid">
				<div>
					<div class="hero__eyebrow anim-fade-up">
						<div class="hero__eyebrow-line"></div>
						<span class="label-amber">Unit Management Software</span>
					</div>

					<h1 class="hero__heading anim-fade-up anim-delay-1">
						Command<br />
						<em>clarity,</em><br />
						every<br />
						formation.
					</h1>

					<p class="hero__body anim-fade-up anim-delay-2">
						TroopToTask replaces scattered spreadsheets, whiteboards, and shared-drive chaos with a structured digital
						workspace built for how units actually operate — from morning accountability to end-of-cycle reporting.
					</p>

					<div class="hero__actions anim-fade-up anim-delay-3">
						<a href="/auth/request-access" class="landing-btn landing-btn--amber">Join Free Beta</a>
					</div>

					<div class="hero__beta anim-fade-up anim-delay-4">
						<p>Help us tighten the product around real-world use and earn free time when we go live.</p>
					</div>

					<div class="hero__meta anim-fade-up anim-delay-5">
						<div class="hero__meta-item">
							<div class="hero__meta-value">Free</div>
							<div class="hero__meta-label">During Beta</div>
						</div>
						<div class="hero__meta-item">
							<div class="hero__meta-value">DoD</div>
							<div class="hero__meta-label">Focused Design</div>
						</div>
						<div class="hero__meta-item">
							<div class="hero__meta-value">Multi</div>
							<div class="hero__meta-label">Org Support</div>
						</div>
						<div class="hero__meta-item">
							<div class="hero__meta-value">Role</div>
							<div class="hero__meta-label">Based Permissions</div>
						</div>
					</div>
				</div>

				<div class="anim-fade-up anim-delay-3">
					<div class="hero__preview">
						<div class="preview__topbar">
							<div class="preview__topbar-title">1st Platoon — Alpha Company</div>
							<div class="preview__topbar-date">{previewDate}</div>
						</div>

						<div class="preview__summary">
							<div class="preview__summary-cell">
								<div class="preview__summary-num" style="color: var(--chart-2)">31</div>
								<div class="preview__summary-lbl">Present</div>
							</div>
							<div class="preview__summary-cell">
								<div class="preview__summary-num" style="color: var(--accent)">4</div>
								<div class="preview__summary-lbl">Leave</div>
							</div>
							<div class="preview__summary-cell">
								<div class="preview__summary-num" style="color: var(--chart-3)">2</div>
								<div class="preview__summary-lbl">TDY</div>
							</div>
							<div class="preview__summary-cell">
								<div class="preview__summary-num" style="color: var(--destructive)">1</div>
								<div class="preview__summary-lbl">Unavail</div>
							</div>
						</div>

						<table class="data-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Rank</th>
									<th>Position</th>
									<th>Status</th>
									<th>Returns</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td class="td-name">Mitchell, A.</td>
									<td class="td-rank">SSG</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Plt Sgt</td>
									<td><span class="status status--present">● Present</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground)">—</td>
								</tr>
								<tr>
									<td class="td-name">Torres, R.</td>
									<td class="td-rank">SGT</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Tm Ldr</td>
									<td><span class="status status--leave">Leave</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground); font-family: 'IBM Plex Mono', monospace"
										>12 JAN</td
									>
								</tr>
								<tr>
									<td class="td-name">Okafor, D.</td>
									<td class="td-rank">SPC</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Rifleman</td>
									<td><span class="status status--tdy">TDY</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground); font-family: 'IBM Plex Mono', monospace"
										>18 JAN</td
									>
								</tr>
								<tr>
									<td class="td-name">Vasquez, M.</td>
									<td class="td-rank">PFC</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Driver</td>
									<td><span class="status status--school">School</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground); font-family: 'IBM Plex Mono', monospace"
										>03 FEB</td
									>
								</tr>
								<tr>
									<td class="td-name">Reinhart, J.</td>
									<td class="td-rank">SPC</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Gunner</td>
									<td><span class="status status--present">● Present</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground)">—</td>
								</tr>
								<tr>
									<td class="td-name">Huang, L.</td>
									<td class="td-rank">CPL</td>
									<td style="font-size: 11px; color: var(--muted-foreground)">Tm Ldr</td>
									<td><span class="status status--present">● Present</span></td>
									<td style="font-size: 11px; color: var(--muted-foreground)">—</td>
								</tr>
							</tbody>
						</table>

						<div class="preview__footer">
							<div class="preview__footer-meta">
								<div>STRENGTH: 38</div>
								<div>
									PRES RATE: <span style="color: var(--chart-2); font-weight: 600">81.6%</span>
								</div>
							</div>
							<div class="preview__footer-actions">
								<span class="badge">Export</span>
								<span class="badge">Print DA Form</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-solves">
		<div class="container">
			<div class="solves__grid">
				<div class="solves__sidebar">
					<div class="label-amber">The Questions That Matter</div>
					<h2 class="solves__sidebar-heading">
						Answer<br />
						<em>faster.</em><br />Brief<br />
						<em>better.</em>
					</h2>
					<p class="solves__sidebar-copy">
						Every formation, every brief, every handoff — the same questions come up. TroopToTask puts the answers one
						click away, not buried in four different spreadsheets.
					</p>
				</div>

				<div class="solves__questions">
					<div class="question-row observe-in">
						<div class="question-num">01</div>
						<div>
							<div class="question-text">Who is here today?</div>
							<div class="question-detail">
								Real-time accountability view. Sorted by platoon, section, or unit. Updated when statuses change — not
								when someone remembers to update a spreadsheet.
							</div>
						</div>
					</div>
					<div class="question-row observe-in">
						<div class="question-num">02</div>
						<div>
							<div class="question-text">Who is unavailable and why?</div>
							<div class="question-detail">
								Leave, TDY, medical, school, profile, appointment, custom — each tracked with expected return date and
								authorized reason visible to leaders with access.
							</div>
						</div>
					</div>
					<div class="question-row observe-in">
						<div class="question-num">03</div>
						<div>
							<div class="question-text">What duties are filled or uncovered?</div>
							<div class="question-detail">
								Daily duty assignment board shows every position — CQ, SDO, details — alongside who is assigned, gaps
								flagged, and the next scheduled rotation.
							</div>
						</div>
					</div>
					<div class="question-row observe-in">
						<div class="question-num">04</div>
						<div>
							<div class="question-text">What training is coming due?</div>
							<div class="question-detail">
								Track certifications, recurring training requirements, and readiness deadlines. See what expires this
								week, this month, or for a specific individual.
							</div>
						</div>
					</div>
					<div class="question-row observe-in">
						<div class="question-num">05</div>
						<div>
							<div class="question-text">Where are the personnel gaps?</div>
							<div class="question-detail">
								Readiness summary surfaces availability rate by element, understrength billets, and personnel pending
								action — at a glance, not a data pull.
							</div>
						</div>
					</div>
					<div class="question-row observe-in">
						<div class="question-num">06</div>
						<div>
							<div class="question-text">What needs action before the next brief?</div>
							<div class="question-detail">
								Expiring evals, pending counselings, open onboarding tasks, and unfiled documents — consolidated into a
								prioritized action queue for each leader.
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-capabilities" id="capabilities">
		<div class="container">
			<div class="caps__header">
				<div>
					<div class="label-amber caps__label">Platform Capabilities</div>
					<h2 class="caps__heading">Built for<br />unit work.</h2>
				</div>
				<p class="caps__intro">
					Not adapted from a corporate project management tool. Not a generic HR system repurposed for military use.
					TroopToTask is built around the actual workflows of unit leadership — from roster management to rating scheme
					tracking.
				</p>
			</div>

			<div class="caps__grid">
				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 01</div>
					<div class="cap-card__title">Personnel Roster</div>
					<div class="cap-card__body">
						Manage personnel organized by platoon, section, or custom group. Track assignment, position, and contact
						data. Export to standard formats on demand.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 02</div>
					<div class="cap-card__title">Availability Calendar</div>
					<div class="cap-card__body">
						Visual unit calendar showing who is present, on leave, TDY, at school, or on profile. Navigate by date range
						or filter by element to answer accountability questions immediately.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 03</div>
					<div class="cap-card__title">Status Tracking</div>
					<div class="cap-card__body">
						Structured statuses — present, leave, TDY, school, appointment, profile, and custom — each with start date,
						expected return, authorizing leader, and remarks.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 04</div>
					<div class="cap-card__title">Duty Assignment</div>
					<div class="cap-card__body">
						Plan and assign daily duties: CQ, SDO, details, and any custom position. See today&apos;s roster against
						available personnel, flag gaps, and maintain a duty history log.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 05</div>
					<div class="cap-card__title">Training &amp; Readiness</div>
					<div class="cap-card__body">
						Track certifications, recurring training requirements, and readiness deadlines by individual. Get visibility
						on what is current, expiring, or overdue across the unit.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 06</div>
					<div class="cap-card__title">Counseling Records</div>
					<div class="cap-card__body">
						Maintain counseling and leader&apos;s book entries by Soldier. Track initial, periodic, and event-driven
						counselings. Flag overdue requirements. Exportable for continuity.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 07</div>
					<div class="cap-card__title">In-Processing &amp; Onboarding</div>
					<div class="cap-card__body">
						Structured workflows for in-processing new arrivals. Checklist-driven tasks assigned across sections. Track
						completion status and hold leaders accountable to deadlines.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 08</div>
					<div class="cap-card__title">Rating Scheme Tracking</div>
					<div class="cap-card__body">
						Monitor OER, NCOER, and WOER timelines. Track rating chain assignments, scheduled dates, and submission
						status. Surface upcoming and overdue evaluations by unit.
					</div>
				</div>

				<div class="cap-card observe-in">
					<div class="cap-card__index">CAP 09</div>
					<div class="cap-card__title">Permissions &amp; Audit</div>
					<div class="cap-card__body">
						Role-based access controls align with unit structure. Full audit log tracks who made what change and when.
						Multi-organization support for higher and adjacent units.
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-roster" id="roster">
		<div class="container--wide">
			<div class="roster__header">
				<div>
					<div class="label-amber roster__label">Roster &amp; Accountability</div>
					<h2 class="roster__heading">Morning accountability.<br />Any formation. Instantly.</h2>
				</div>
				<div class="roster__header-copy">
					<p>
						The roster is the source of truth. Every status update flows back to it. Print a DA Form 1594 or export for
						the S1 — no reformatting required.
					</p>
				</div>
			</div>

			<div class="roster__panel">
				<div class="roster__toolbar">
					<div class="roster__toolbar-left">
						<div class="roster__unit-label">Bravo Company — 2-87 IN</div>
						<div class="roster__date">{rosterDate}</div>
						<span class="badge badge--amber badge--dot">Live View</span>
					</div>
					<div class="roster__availability">
						<div class="avail-stat">
							<div class="avail-stat__num">142</div>
							<div class="avail-stat__lbl">Assigned</div>
						</div>
						<div class="avail-stat">
							<div class="avail-stat__num" style="color: var(--chart-2)">127</div>
							<div class="avail-stat__lbl">Present</div>
						</div>
						<div class="avail-stat">
							<div class="avail-stat__num" style="color: var(--accent)">9</div>
							<div class="avail-stat__lbl">Leave / TDY</div>
						</div>
						<div class="avail-stat">
							<div class="avail-stat__num" style="color: var(--destructive)">6</div>
							<div class="avail-stat__lbl">Unavail</div>
						</div>
						<div class="roster__divider"></div>
						<div class="avail-stat">
							<div class="avail-stat__num">89.4%</div>
							<div class="avail-stat__lbl">Pres Rate</div>
						</div>
					</div>
				</div>

				<div class="roster__table-wrap">
					<table class="data-table roster__table">
						<thead>
							<tr>
								<th style="width: 28px">#</th>
								<th>Name</th>
								<th>Rank</th>
								<th>MOS</th>
								<th>Element</th>
								<th>Position</th>
								<th>Status</th>
								<th>BASD</th>
								<th>ETS</th>
								<th>Returns</th>
								<th>Counseled</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="row-count">01</td>
								<td class="td-name">Anderson, K.L.</td>
								<td class="td-rank">CPT</td>
								<td class="table-mono">11A</td>
								<td class="table-mono">HHC</td>
								<td class="table-mono">CO CDR</td>
								<td><span class="status status--present">● Present</span></td>
								<td class="table-date">15 MAR 19</td>
								<td class="table-date">14 MAR 27</td>
								<td class="table-muted">—</td>
								<td><span class="badge badge-success">Current</span></td>
							</tr>
							<tr>
								<td class="row-count">02</td>
								<td class="td-name">Williams, D.J.</td>
								<td class="td-rank">1SG</td>
								<td class="table-mono">11Z</td>
								<td class="table-mono">HHC</td>
								<td class="table-mono">First Sgt</td>
								<td><span class="status status--present">● Present</span></td>
								<td class="table-date">03 JUN 10</td>
								<td class="table-date">02 JUN 28</td>
								<td class="table-muted">—</td>
								<td><span class="badge badge-success">Current</span></td>
							</tr>
							<tr>
								<td class="row-count">03</td>
								<td class="td-name">Patel, S.R.</td>
								<td class="td-rank">SSG</td>
								<td class="table-mono">11B</td>
								<td class="table-mono">1st PLT</td>
								<td class="table-mono">Plt Sgt</td>
								<td><span class="status status--leave">Leave</span></td>
								<td class="table-date">17 SEP 16</td>
								<td class="table-date">16 SEP 25</td>
								<td class="table-date table-date-amber">05 APR</td>
								<td><span class="badge badge-success">Current</span></td>
							</tr>
							<tr>
								<td class="row-count">04</td>
								<td class="td-name">Jackson, T.M.</td>
								<td class="td-rank">SGT</td>
								<td class="table-mono">11B</td>
								<td class="table-mono">1st PLT</td>
								<td class="table-mono">Tm Ldr</td>
								<td><span class="status status--present">● Present</span></td>
								<td class="table-date">22 JAN 20</td>
								<td class="table-date">21 JAN 26</td>
								<td class="table-muted">—</td>
								<td><span class="badge badge-warning">Due Soon</span></td>
							</tr>
							<tr>
								<td class="row-count">05</td>
								<td class="td-name">Kowalski, B.A.</td>
								<td class="td-rank">SPC</td>
								<td class="table-mono">11B</td>
								<td class="table-mono">1st PLT</td>
								<td class="table-mono">Rifleman</td>
								<td><span class="status status--tdy">TDY</span></td>
								<td class="table-date">08 AUG 22</td>
								<td class="table-date">07 AUG 26</td>
								<td class="table-date">14 APR</td>
								<td><span class="badge badge-success">Current</span></td>
							</tr>
							<tr>
								<td class="row-count">06</td>
								<td class="td-name">Reyes, C.F.</td>
								<td class="td-rank">PFC</td>
								<td class="table-mono">11C</td>
								<td class="table-mono">2nd PLT</td>
								<td class="table-mono">Mortarman</td>
								<td><span class="status status--school">School</span></td>
								<td class="table-date">11 MAR 24</td>
								<td class="table-date">10 MAR 27</td>
								<td class="table-date">30 MAY</td>
								<td><span class="badge badge-success">Current</span></td>
							</tr>
							<tr>
								<td class="row-count">07</td>
								<td class="td-name">Okonkwo, E.N.</td>
								<td class="td-rank">SPC</td>
								<td class="table-mono">11B</td>
								<td class="table-mono">2nd PLT</td>
								<td class="table-mono">Gunner</td>
								<td><span class="status status--unavail">Unavail</span></td>
								<td class="table-date">29 NOV 21</td>
								<td class="table-date">28 NOV 25</td>
								<td class="table-date table-date-danger">See Remarks</td>
								<td><span class="badge badge-danger">Overdue</span></td>
							</tr>
						</tbody>
					</table>
				</div>

				<div class="roster__table-footer">
					<div class="roster__table-status">Showing 7 of 142 personnel · Sorted: Rank ↑</div>
					<div class="roster__table-actions">
						<span class="badge">Filter</span>
						<span class="badge">Sort</span>
						<span class="badge badge--amber">Export Roster</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-audience">
		<div class="container">
			<div class="audience__grid">
				<div>
					<div class="label-amber audience__label">Designed For Leadership</div>
					<h2 class="audience__heading">
						Built for<br />
						the people<br />
						<em>running</em><br />
						the unit.
					</h2>
					<p class="audience__copy">
						TroopToTask is designed around actual military leader roles — not abstract organizational charts. Access and
						visibility are scoped to your level of responsibility.
					</p>
				</div>

				<div class="audience__roles">
					<div class="role-row observe-in">
						<div class="role-name">Commander / XO</div>
						<span class="role-badge">Full Unit Visibility</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">First Sergeant</div>
						<span class="role-badge">Enlisted Oversight</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">Platoon Leader / PSG</div>
						<span class="role-badge">Platoon Scope</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">Section Leader</div>
						<span class="role-badge">Section Scope</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">Training Room NCO</div>
						<span class="role-badge">Training Admin Access</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">S1 / Admin Staff</div>
						<span class="role-badge">Readiness Admin</span>
					</div>
					<div class="role-row observe-in">
						<div class="role-name">Higher Headquarters</div>
						<span class="role-badge">Multi-Org Read Access</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-proof">
		<div class="container">
			<div class="proof__inner">
				<div>
					<div class="proof__rule"></div>
					<p class="proof__quote">
						&quot;The whiteboard gets erased. The shared drive is a mess. Someone always has
						<strong>a different version</strong> of the roster. TroopToTask is the one place every leader looks.&quot;
					</p>
					<div class="proof__attribution">— Company Commander, Active Duty Infantry Unit</div>
				</div>

				<div class="proof__points">
					<div class="proof__point observe-in">
						<svg class="proof__point-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<polyline points="4 10 8 14 16 6"></polyline>
						</svg>
						<div class="proof__point-text">
							<strong>Replaces the whiteboard.</strong> Statuses update in the system. No marker, no erasing, no confusion
							about what&apos;s current.
						</div>
					</div>
					<div class="proof__point observe-in">
						<svg class="proof__point-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<polyline points="4 10 8 14 16 6"></polyline>
						</svg>
						<div class="proof__point-text">
							<strong>Replaces the spreadsheet.</strong> Roster data lives in one structured system. Exports are format-ready.
							No reformatting for the S1.
						</div>
					</div>
					<div class="proof__point observe-in">
						<svg class="proof__point-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<polyline points="4 10 8 14 16 6"></polyline>
						</svg>
						<div class="proof__point-text">
							<strong>Replaces scattered shared drives.</strong> Counselings, training records, and onboarding checklists
							in one permission-controlled location.
						</div>
					</div>
					<div class="proof__point observe-in">
						<svg class="proof__point-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
							<polyline points="4 10 8 14 16 6"></polyline>
						</svg>
						<div class="proof__point-text">
							<strong>Built for leader transitions.</strong> Full audit log and continuity records mean incoming leaders have
							context from day one.
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="section-faq" id="faq">
		<div class="container">
			<div class="faq__header">
				<div class="label-amber faq__label">Frequently Asked Questions</div>
				<h2 class="faq__heading">
					The questions people ask
					<br />
					<em>before they hand over the roster.</em>
				</h2>
			</div>

			<div class="faq__list">
				{#each faqs as item (item.question)}
					<details class="faq-item">
						<summary class="faq-question">
							<span>{item.question}</span>
							<span class="faq-icon" aria-hidden="true"></span>
						</summary>
						<div class="faq-answer">
							<p>{item.answer}</p>
						</div>
					</details>
				{/each}
			</div>
		</div>
	</section>

	<section class="section-cta" id="roadmap">
		<div class="container">
			<div class="cta__inner">
				<div>
					<div class="label-amber cta__label">Get Started</div>
					<h2 class="cta__heading">Ready to run<br />a tighter unit?</h2>
					<p class="cta__subtext">
						Request free beta access for your unit. TroopToTask is onboarded by organization — we work with you to
						configure your structure, import your roster, and train your team leads before broader paid rollout.
					</p>
				</div>
				<div class="cta__actions">
					<a href="/auth/request-access" class="landing-btn landing-btn--amber cta__action-primary">Join Free Beta</a>
					<a href="/pricing" class="landing-btn landing-btn--outline">View Pricing</a>
					<div class="cta__note">Free during beta · paid plans later</div>
				</div>
			</div>
		</div>
	</section>
</PublicShell>

<style>
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.container--wide {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.label-amber {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.label-amber {
		color: var(--accent);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--muted-foreground);
		background: var(--card);
	}

	.badge--amber {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
	}

	.badge--dot::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		display: inline-block;
	}

	.badge-success {
		background: color-mix(in srgb, var(--chart-2) 14%, var(--card));
		color: var(--chart-2);
		border-color: color-mix(in srgb, var(--chart-2) 20%, transparent);
	}

	.badge-warning {
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 24%, transparent);
	}

	.badge-danger {
		background: color-mix(in srgb, var(--destructive) 14%, var(--card));
		color: var(--destructive);
		border-color: color-mix(in srgb, var(--destructive) 20%, transparent);
	}

	.landing-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.1875rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 10px 1.5rem;
		border-radius: var(--radius);
		line-height: 1;
		text-decoration: none;
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.landing-btn--amber {
		background: var(--accent);
		color: var(--background);
		border: 1px solid var(--accent);
	}

	.landing-btn--amber:hover {
		background: var(--accent);
		border-color: var(--accent);
	}

	.landing-btn--outline {
		background: transparent;
		color: var(--foreground);
		border: 1px solid var(--border);
	}

	.landing-btn--outline:hover {
		border-color: var(--muted-foreground);
		background: var(--muted);
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: var(--radius);
		border: 1px solid transparent;
	}

	.status--present {
		background: color-mix(in srgb, var(--chart-2) 14%, var(--card));
		color: var(--chart-2);
		border-color: color-mix(in srgb, var(--chart-2) 20%, transparent);
	}

	.status--leave {
		background: color-mix(in srgb, var(--accent) 16%, var(--card));
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 24%, transparent);
	}

	.status--tdy {
		background: color-mix(in srgb, var(--chart-3) 14%, var(--card));
		color: var(--chart-3);
		border-color: color-mix(in srgb, var(--chart-3) 20%, transparent);
	}

	.status--unavail {
		background: color-mix(in srgb, var(--destructive) 14%, var(--card));
		color: var(--destructive);
		border-color: color-mix(in srgb, var(--destructive) 20%, transparent);
	}

	.status--school {
		background: var(--muted);
		color: var(--muted-foreground);
		border-color: var(--border);
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
	}

	.data-table th {
		text-align: left;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.data-table td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--muted);
		color: var(--muted-foreground);
		vertical-align: middle;
	}

	.data-table tr:last-child td {
		border-bottom: none;
	}

	.td-name {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--foreground);
	}

	.td-rank,
	.table-mono,
	.table-date,
	.table-muted,
	.row-count {
		font-size: 11px;
		color: var(--muted-foreground);
	}

	.td-rank,
	.row-count,
	.table-muted {
		color: var(--muted-foreground);
	}

	.table-date {
		font-family: 'IBM Plex Mono', monospace;
		color: var(--muted-foreground);
	}

	.table-date-amber {
		color: var(--accent);
	}

	.table-date-danger {
		color: var(--destructive);
	}

	.hero {
		padding: 6rem 0 5rem;
		border-bottom: 1px solid var(--border);
		position: relative;
		overflow: hidden;
	}

	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image: repeating-linear-gradient(
			to right,
			var(--muted) 0px,
			var(--muted) 1px,
			transparent 1px,
			transparent calc(100% / 12)
		);
		pointer-events: none;
		opacity: 0.7;
	}

	.hero__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5rem;
		align-items: start;
		position: relative;
	}

	.hero__eyebrow {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.hero__eyebrow-line,
	.proof__rule {
		width: 24px;
		height: 2px;
		background: var(--accent);
	}

	.proof__rule {
		width: 32px;
		margin-bottom: 2rem;
	}

	.hero__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: clamp(52px, 7vw, 80px);
		font-weight: 800;
		line-height: 0.92;
		letter-spacing: -0.01em;
		color: var(--foreground);
		text-transform: uppercase;
		margin: 0 0 2rem;
	}

	.hero__heading em,
	.solves__sidebar-heading em,
	.audience__heading em,
	.faq__heading em {
		font-style: italic;
		font-weight: 300;
		color: var(--muted-foreground);
	}

	.hero__body {
		font-size: 1.1875rem;
		font-weight: 300;
		color: var(--muted-foreground);
		line-height: 1.55;
		max-width: 480px;
		margin: 0 0 2rem;
	}

	.hero__actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.hero__beta {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.5rem;
		max-width: 520px;
	}

	.hero__beta p {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 300;
		line-height: 1.6;
		color: var(--muted-foreground);
	}

	.hero__meta {
		display: flex;
		gap: 2rem;
		margin-top: 2.5rem;
		padding-top: 2rem;
		border-top: 1px solid var(--border);
	}

	.hero__meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.hero__meta-value {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--foreground);
		line-height: 1;
	}

	.hero__meta-label {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.hero__preview,
	.roster__panel,
	.cta__inner {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow:
			0 4px 20px rgb(0 0 0 / 0.12),
			0 2px 6px rgb(0 0 0 / 0.07);
		position: relative;
	}

	.preview__topbar {
		background: var(--foreground);
		color: var(--background);
		padding: 10px 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.preview__topbar-title {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.preview__topbar-date {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 11px;
		color: color-mix(in srgb, var(--hero-muted) 60%, transparent);
	}

	.preview__summary {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-bottom: 1px solid var(--border);
	}

	.preview__summary-cell {
		padding: 10px 0.75rem;
		border-right: 1px solid var(--border);
		text-align: center;
	}

	.preview__summary-cell:last-child {
		border-right: none;
	}

	.preview__summary-num {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.375rem;
		font-weight: 700;
		line-height: 1;
	}

	.preview__summary-lbl {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		margin-top: 3px;
	}

	.preview__footer {
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border);
		background: var(--muted);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.preview__footer-meta {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		color: var(--muted-foreground);
	}

	.preview__footer-actions,
	.roster__table-actions {
		display: flex;
		gap: 0.5rem;
	}

	.section-solves,
	.section-capabilities,
	.section-roster,
	.section-audience,
	.section-proof,
	.section-faq,
	.section-cta {
		padding: 6rem 0;
		border-bottom: 1px solid var(--border);
	}

	.solves__grid {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 5rem;
		align-items: start;
	}

	.solves__sidebar {
		position: sticky;
		top: calc(56px + 2rem);
	}

	.solves__sidebar-heading,
	.caps__heading,
	.roster__heading,
	.audience__heading,
	.faq__heading,
	.cta__heading {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 800;
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--foreground);
		margin: 0;
	}

	.solves__sidebar-heading,
	.caps__heading,
	.audience__heading {
		font-size: 3.25rem;
	}

	.solves__sidebar-copy,
	.caps__intro,
	.roster__header-copy p,
	.audience__copy,
	.cta__subtext {
		font-size: 1rem;
		font-weight: 300;
		color: var(--muted-foreground);
		line-height: 1.65;
	}

	.solves__sidebar-copy,
	.audience__copy {
		margin-top: 1.5rem;
		max-width: 380px;
	}

	.solves__questions,
	.audience__roles,
	.proof__points {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.question-row,
	.role-row,
	.proof__point {
		display: grid;
		align-items: start;
	}

	.question-row {
		grid-template-columns: 28px 1fr;
		gap: 1.25rem;
		padding: 1.5rem 0;
		border-bottom: 1px solid var(--border);
	}

	.question-row:first-child,
	.role-row:first-child,
	.proof__point:first-child {
		border-top: 1px solid var(--border);
	}

	.question-num {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 600;
		color: var(--accent);
		letter-spacing: 0.08em;
		padding-top: 3px;
	}

	.question-text,
	.cap-card__title,
	.role-name {
		font-family: 'Barlow Condensed', sans-serif;
		font-weight: 600;
		color: var(--foreground);
		letter-spacing: 0.01em;
		text-transform: uppercase;
	}

	.question-text {
		font-size: 1.375rem;
		line-height: 1.25;
	}

	.question-detail,
	.cap-card__body,
	.proof__point-text,
	.faq-answer p {
		font-size: 0.8125rem;
		font-weight: 300;
		color: var(--muted-foreground);
		line-height: 1.6;
		margin-top: 0.5rem;
	}

	.caps__header,
	.audience__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5rem;
	}

	.caps__header {
		align-items: end;
		margin-bottom: 4rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid var(--border);
	}

	.caps__label,
	.audience__label,
	.roster__label,
	.faq__label,
	.cta__label {
		margin-bottom: 1rem;
	}

	.caps__grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.cap-card {
		padding: 2rem;
		border-right: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		background: var(--card);
		transition: background 0.15s;
	}

	.cap-card:hover {
		background: var(--muted);
	}

	.cap-card:nth-child(3n) {
		border-right: none;
	}

	.cap-card:nth-child(n + 7) {
		border-bottom: none;
	}

	.cap-card__index {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 600;
		color: var(--accent);
		letter-spacing: 0.12em;
		margin-bottom: 1.25rem;
	}

	.cap-card__title {
		font-size: 1.1875rem;
		margin-bottom: 0.75rem;
		line-height: 1.15;
	}

	.roster__header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-bottom: 2.5rem;
		gap: 2.5rem;
	}

	.roster__heading {
		font-size: 2.25rem;
		line-height: 1;
	}

	.roster__header-copy {
		text-align: right;
	}

	.roster__header-copy p {
		max-width: 320px;
		margin: 0;
	}

	.roster__toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--border);
		background: var(--muted);
		gap: 1rem;
	}

	.roster__toolbar-left {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.roster__unit-label,
	.role-name {
		font-size: 0.8125rem;
		letter-spacing: 0.06em;
	}

	.roster__date {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		color: var(--muted-foreground);
	}

	.roster__availability {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.avail-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.avail-stat__num {
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
		color: var(--foreground);
	}

	.avail-stat__lbl {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.roster__divider {
		width: 1px;
		height: 32px;
		background: var(--border);
	}

	.roster__table-wrap {
		overflow-x: auto;
	}

	.roster__table {
		min-width: 700px;
	}

	.roster__table-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		border-top: 1px solid var(--border);
		background: var(--muted);
		gap: 1rem;
	}

	.roster__table-status {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		color: var(--muted-foreground);
	}

	.role-row {
		grid-template-columns: 1fr auto;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border);
	}

	.role-badge {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: var(--radius);
		background: var(--muted);
		color: var(--muted-foreground);
		border: 1px solid var(--border);
	}

	.section-proof {
		background: var(--color-chrome);
		color: var(--color-chrome-text);
		border-bottom-color: var(--color-chrome-border);
	}

	.proof__inner {
		display: grid;
		grid-template-columns: 1fr 480px;
		gap: 5rem;
		align-items: center;
	}

	.proof__quote {
		font-size: clamp(22px, 3vw, 32px);
		font-weight: 300;
		font-style: italic;
		line-height: 1.4;
		color: var(--color-chrome-text);
		margin: 0;
	}

	.proof__quote strong {
		font-style: normal;
		font-weight: 600;
		color: var(--accent);
	}

	.proof__attribution {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		color: color-mix(in srgb, var(--color-chrome-text-muted) 88%, var(--color-chrome-text) 12%);
		margin-top: 1.5rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.proof__point {
		grid-template-columns: 20px 1fr;
		gap: 1rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--color-chrome-border);
	}

	.proof__point:first-child {
		border-top: 1px solid var(--color-chrome-border);
	}

	.proof__point-icon {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		margin-top: 2px;
		color: var(--accent);
	}

	.proof__point-text {
		margin-top: 0;
		color: color-mix(in srgb, var(--color-chrome-text-muted) 90%, var(--color-chrome-text) 10%);
	}

	.proof__point-text strong {
		color: var(--color-chrome-text);
		font-weight: 600;
		font-style: normal;
	}

	.section-faq {
		background: var(--background);
	}

	.faq__header {
		margin-bottom: 3rem;
	}

	.faq__heading {
		font-size: clamp(32px, 5vw, 60px);
	}

	.faq__list {
		border-top: 1px solid var(--border);
		max-width: 960px;
	}

	.faq-item {
		border-bottom: 1px solid var(--border);
	}

	.faq-question {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.5rem 0;
		cursor: pointer;
		list-style: none;
		font-family: 'Barlow Condensed', sans-serif;
		font-size: 1.375rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1.2;
		text-transform: uppercase;
		color: var(--foreground);
	}

	.faq-question::-webkit-details-marker {
		display: none;
	}

	.faq-question:hover {
		color: var(--accent);
	}

	.faq-question:focus-visible,
	.landing-btn:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
	}

	.faq-icon::before {
		content: '+';
		font-size: 1.375rem;
		font-weight: 300;
		color: var(--accent);
		line-height: 1;
	}

	.faq-item[open] .faq-icon::before {
		content: '×';
	}

	.faq-answer {
		padding-bottom: 1.5rem;
		max-width: 900px;
	}

	.faq-answer p {
		margin: 0;
		font-size: 1rem;
		line-height: 1.75;
	}

	.section-cta {
		padding-top: 5rem;
	}

	.cta__inner {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 5rem;
		align-items: center;
		padding: 4rem 5rem;
	}

	.cta__inner::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: var(--accent);
	}

	.cta__heading {
		font-size: clamp(32px, 5vw, 60px);
		margin-bottom: 1rem;
	}

	.cta__subtext {
		margin: 1.25rem 0 0;
		max-width: 480px;
		line-height: 1.6;
	}

	.cta__actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.cta__action-primary {
		font-size: 1.1875rem;
		padding: 12px 28px;
	}

	.cta__note {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 10px;
		color: var(--muted-foreground);
		letter-spacing: 0.08em;
		text-align: center;
		margin-top: 0.5rem;
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.anim-fade-up {
		animation: fadeUp 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.anim-delay-1 {
		animation-delay: 0.08s;
	}

	.anim-delay-2 {
		animation-delay: 0.16s;
	}

	.anim-delay-3 {
		animation-delay: 0.24s;
	}

	.anim-delay-4 {
		animation-delay: 0.32s;
	}

	.anim-delay-5 {
		animation-delay: 0.4s;
	}

	@media (max-width: 900px) {
		.hero__grid,
		.solves__grid,
		.caps__header,
		.audience__grid,
		.proof__inner,
		.cta__inner {
			grid-template-columns: 1fr;
			gap: 2.5rem;
		}

		.hero__preview {
			display: none;
		}

		.caps__grid {
			grid-template-columns: 1fr 1fr;
		}

		.hero {
			padding: 4rem 0;
		}

		.cta__inner {
			padding: 2.5rem 2rem;
		}

		.solves__sidebar {
			position: static;
			top: auto;
		}
	}

	@media (max-width: 700px) {
		.roster__header,
		.roster__toolbar,
		.roster__table-footer,
		.preview__footer,
		.hero__actions,
		.hero__beta,
		.hero__meta {
			flex-direction: column;
			align-items: flex-start;
		}

		.avail-stat {
			align-items: flex-start;
		}

		.roster__header-copy {
			text-align: left;
		}
	}

	@media (max-width: 600px) {
		.container,
		.container--wide {
			padding: 0 1rem;
		}

		.caps__grid {
			grid-template-columns: 1fr;
		}

		.cap-card {
			border-right: none;
		}

		.cap-card:nth-child(n + 7) {
			border-bottom: 1px solid var(--border);
		}

		.cap-card:last-child {
			border-bottom: none;
		}

		.hero__heading,
		.faq__heading,
		.cta__heading {
			font-size: clamp(40px, 16vw, 60px);
		}

		.solves__sidebar-heading,
		.caps__heading,
		.audience__heading {
			font-size: clamp(30px, 12vw, 42px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.anim-fade-up {
			animation: none;
		}

		.cap-card,
		.landing-btn {
			transition: none;
		}
	}
</style>
