<script lang="ts">
	import PublicDemoFrame from '$lib/components/public/PublicDemoFrame.svelte';
	import PublicFeatureSection from '$lib/components/public/PublicFeatureSection.svelte';
	import PublicPageHeader from '$lib/components/public/PublicPageHeader.svelte';
	import PublicShell from '$lib/components/public/PublicShell.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Features - Troop to Task</title>
	<meta
		name="description"
		content="Explore all Troop to Task features: visual calendars, personnel management, training tracking, leaders book, in-processing checklists, rating schemes, and daily assignments."
	/>
</svelte:head>

<PublicShell user={data.user} active="features" bodyClass="features-page" roadmapHref="/#roadmap">
	<PublicPageHeader label="Platform">
		{#snippet title()}Everything your unit needs,<br /><em>nothing it doesn't.</em>{/snippet}
		<p>
			Eight operational lanes, one shared system. TroopToTask is built to replace the whiteboard, the spreadsheet stack,
			and the "who has the latest version?" problem.
		</p>
	</PublicPageHeader>

	<section class="feature-rollup">
		<div class="feature-rollup__inner">
			<div>
				<div class="feature-rollup__label">Capability Rollup</div>
				<h2>One platform for accountability, readiness, and follow-through.</h2>
			</div>

			<div class="feature-rollup__grid">
				<div>Calendar and availability tracking</div>
				<div>Personnel rosters and grouping</div>
				<div>Training status and expiration alerts</div>
				<div>Counseling and leader records</div>
				<div>Onboarding and in-processing</div>
				<div>Rating scheme visibility</div>
				<div>Daily assignment planning</div>
				<div>Security controls and audit coverage</div>
			</div>
		</div>
	</section>

	<PublicFeatureSection
		label="01 // Calendar"
		titleBefore="See your entire unit "
		emphasis="at a glance."
		description="A visual calendar that replaces the whiteboard. Status color, date range, and grouped visibility make it obvious who is available, who is out, and where the gaps are before the next brief."
		bullets={[
			'Color-coded statuses for leave, TDY, school, appointments, and custom categories',
			'Month and multi-month views for short-range accountability and longer planning windows',
			'Strength and coverage visibility by day instead of manual counting',
			'Print-ready exports for formations, boards, and handoff packets'
		]}
	>
		<PublicDemoFrame label="Calendar" status="Live">
			<div class="cal-month-label">March 2026</div>
			<div class="cal-grid">
				<div class="cal-header">M</div>
				<div class="cal-header">T</div>
				<div class="cal-header">W</div>
				<div class="cal-header">T</div>
				<div class="cal-header">F</div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-leave"></div>
				<div class="cal-cell cal-leave"></div>
				<div class="cal-cell cal-leave"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-tdy"></div>
				<div class="cal-cell cal-tdy"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-appt"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-school"></div>
				<div class="cal-cell cal-school"></div>
				<div class="cal-cell cal-school"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-appt"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-leave"></div>
				<div class="cal-cell cal-leave"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-empty"></div>
				<div class="cal-cell cal-tdy"></div>
				<div class="cal-cell cal-tdy"></div>
				<div class="cal-cell cal-tdy"></div>
			</div>
			<div class="cal-legend">
				<div class="cal-legend-item"><span class="cal-legend-dot cal-leave"></span>Leave</div>
				<div class="cal-legend-item"><span class="cal-legend-dot cal-tdy"></span>TDY</div>
				<div class="cal-legend-item"><span class="cal-legend-dot cal-school"></span>School</div>
				<div class="cal-legend-item"><span class="cal-legend-dot cal-appt"></span>Appt</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="02 // Personnel"
		titleBefore="Organize your roster, "
		emphasis="your way."
		description="Build the roster around the unit structure you actually use. Group by platoon, section, or any custom slice, and keep rank, MOS, role, and contact data where leaders can find it quickly."
		bullets={[
			'Flexible organization by platoon, section, staff lane, or custom groups',
			'Bulk import from spreadsheets to stand the roster up quickly',
			'Track rank, MOS, role, and contact data without bouncing between systems',
			'Pin common views so recurring accountability tasks stay fast'
		]}
		reversed
		alternate
	>
		<PublicDemoFrame label="Personnel">
			<div class="demo-search">
				<svg
					class="demo-search-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
				</svg>
				<span class="demo-search-text">Search personnel...</span>
			</div>
			<div class="demo-group-header">
				<span class="demo-group-name">1st Platoon</span>
				<span class="demo-group-count">4</span>
			</div>
			<div class="demo-roster">
				<div class="demo-roster-row">
					<span class="demo-rank">SSG</span>
					<span class="demo-name">Martinez, Carlos J.</span>
					<span class="demo-mos">11B</span>
				</div>
				<div class="demo-roster-row">
					<span class="demo-rank">SGT</span>
					<span class="demo-name">Thompson, Alyssa R.</span>
					<span class="demo-mos">25U</span>
				</div>
				<div class="demo-roster-row">
					<span class="demo-rank">SPC</span>
					<span class="demo-name">Nguyen, David K.</span>
					<span class="demo-mos">68W</span>
				</div>
				<div class="demo-roster-row">
					<span class="demo-rank">PFC</span>
					<span class="demo-name">Davis, Jordan L.</span>
					<span class="demo-mos">11B</span>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="03 // Training"
		titleBefore="Never miss an expiration "
		emphasis="again."
		description="Track the certifications and recurring training requirements that actually drive readiness. Due windows, color signal, and exportable status views make it easier to act before something slips."
		bullets={[
			'Warning windows at 60, 30, and 0 days before expiration',
			'Unit-wide completion visibility instead of one-off spreadsheet checks',
			'Custom training types with optional expiration tracking',
			'Excel export support for reporting and cross-checking'
		]}
	>
		<PublicDemoFrame label="Training">
			<div class="demo-training-list">
				<div class="demo-training-row">
					<div class="demo-training-header">
						<span class="demo-training-name">CPR / BLS Certification</span>
						<span class="demo-training-status current">Current</span>
					</div>
					<div class="demo-training-bar">
						<div class="demo-training-fill demo-training-fill--success" style="width: 85%;"></div>
					</div>
					<div class="demo-training-meta">
						<span class="demo-training-date">Exp: 14 Aug 2026</span>
						<span class="demo-training-date">164 days</span>
					</div>
				</div>
				<div class="demo-training-row">
					<div class="demo-training-header">
						<span class="demo-training-name">Weapons Qualification</span>
						<span class="demo-training-status expiring">Due 60</span>
					</div>
					<div class="demo-training-bar">
						<div class="demo-training-fill demo-training-fill--info" style="width: 42%;"></div>
					</div>
					<div class="demo-training-meta">
						<span class="demo-training-date">Exp: 02 May 2026</span>
						<span class="demo-training-date">57 days</span>
					</div>
				</div>
				<div class="demo-training-row">
					<div class="demo-training-header">
						<span class="demo-training-name">SHARP Training</span>
						<span class="demo-training-status warn">Due 30</span>
					</div>
					<div class="demo-training-bar">
						<div class="demo-training-fill demo-training-fill--amber" style="width: 22%;"></div>
					</div>
					<div class="demo-training-meta">
						<span class="demo-training-date">Exp: 01 Apr 2026</span>
						<span class="demo-training-date">26 days</span>
					</div>
				</div>
				<div class="demo-training-row">
					<div class="demo-training-header">
						<span class="demo-training-name">PHA / Dental Readiness</span>
						<span class="demo-training-status expired">Expired</span>
					</div>
					<div class="demo-training-bar">
						<div class="demo-training-fill demo-training-fill--danger" style="width: 0%;"></div>
					</div>
					<div class="demo-training-meta">
						<span class="demo-training-date">Exp: 15 Feb 2026</span>
						<span class="demo-training-date">19 days ago</span>
					</div>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="04 // Leaders Book"
		titleBefore="Your digital counseling "
		emphasis="packet."
		description="The leaders book is being rebuilt now with a cleaner record model and better continuity for follow-ups. The direction stays the same: structured counseling history, supporting documents, and leader memory that survives handoffs."
		bullets={[
			'Counseling records with document upload and download support',
			'Development goals and follow-up tracking per soldier',
			'Chronological timeline for a cleaner leadership history',
			'Support for initial, quarterly, and event-based counseling'
		]}
		reversed
		alternate
		badge="Coming Soon"
	>
		<PublicDemoFrame label="Leaders Book">
			<div class="demo-soldier-header">
				<div>
					<div class="demo-soldier-name">SSG Martinez, Carlos J.</div>
					<div class="demo-soldier-info">11B - 1st Platoon, Alpha Co</div>
				</div>
			</div>
			<div class="demo-timeline">
				<div class="demo-timeline-entry">
					<div class="demo-timeline-date">06 Mar 26</div>
					<div class="demo-timeline-content">
						<div class="demo-timeline-top">
							<span class="demo-counseling-type event">Event</span>
							<svg
								class="demo-file-icon"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"
								/>
							</svg>
						</div>
						<div class="demo-timeline-summary">
							Excellence during FTX. Led the squad through night land navigation with zero incidents.
						</div>
					</div>
				</div>
				<div class="demo-timeline-entry">
					<div class="demo-timeline-date">15 Jan 26</div>
					<div class="demo-timeline-content">
						<div class="demo-timeline-top">
							<span class="demo-counseling-type quarterly">Quarterly</span>
						</div>
						<div class="demo-timeline-summary">On track for promotion and recommended for BLC next quarter.</div>
					</div>
				</div>
				<div class="demo-timeline-entry">
					<div class="demo-timeline-date">02 Oct 25</div>
					<div class="demo-timeline-content">
						<div class="demo-timeline-top">
							<span class="demo-counseling-type initial">Initial</span>
							<svg
								class="demo-file-icon"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"
								/>
							</svg>
						</div>
						<div class="demo-timeline-summary">
							Initial counseling covering duties, expectations, and development plan.
						</div>
					</div>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="05 // In-Processing"
		titleBefore="Onboard new personnel "
		emphasis="with confidence."
		description="Create a repeatable in-processing lane instead of rebuilding the same checklist every arrival cycle. Leaders can track step completion, bottlenecks, and who still owes what before they disappear into email chains."
		bullets={[
			'Custom onboarding templates per organization',
			'Per-person progress tracking with completion dates',
			'Step-based reporting to surface unit-wide bottlenecks',
			'Simultaneous tracking for multiple new arrivals'
		]}
	>
		<PublicDemoFrame label="In-Processing">
			<div class="demo-progress-header">
				<div class="demo-progress-names">SPC Davis, Jordan L. / PFC Chen, Michael W.</div>
				<div class="demo-progress-bar-container">
					<div class="demo-progress-bar">
						<div class="demo-progress-fill" style="width: 80%;"></div>
					</div>
				</div>
				<div class="demo-progress-text">4 of 5 steps complete</div>
			</div>
			<div class="demo-checklist">
				<div class="demo-checklist-item completed">
					<div class="demo-checkbox checked">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					</div>
					<span class="demo-checklist-label">DEERS Enrollment</span>
				</div>
				<div class="demo-checklist-item completed">
					<div class="demo-checkbox checked">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					</div>
					<span class="demo-checklist-label">CAC Card Pickup</span>
				</div>
				<div class="demo-checklist-item completed">
					<div class="demo-checkbox checked">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					</div>
					<span class="demo-checklist-label">Unit Welcome Brief</span>
				</div>
				<div class="demo-checklist-item completed">
					<div class="demo-checkbox checked">
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					</div>
					<span class="demo-checklist-label">Barracks Assignment</span>
				</div>
				<div class="demo-checklist-item">
					<div class="demo-checkbox"></div>
					<span class="demo-checklist-label">Personnel Data Sheet</span>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="06 // Rating Scheme"
		titleBefore="Stay ahead of "
		emphasis="every evaluation."
		description="Track OER, NCOER, and WOER visibility in one place. Due windows and color signal make it harder for a report to surprise the chain at the last minute."
		bullets={[
			'OER, NCOER, and WOER support in the same tracking lane',
			'Due-status alerts for overdue, due in 30, and due in 60 windows',
			'Quick dashboard visibility for upcoming evaluation pressure',
			'Export support for reporting, filing, and staff review'
		]}
		reversed
		alternate
	>
		<PublicDemoFrame label="Rating Scheme">
			<div class="demo-eval-table">
				<div class="demo-eval-header">
					<span class="demo-eval-col-name">Name</span>
					<span class="demo-eval-col-type">Type</span>
					<span class="demo-eval-col-due">Due</span>
					<span class="demo-eval-col-status">Status</span>
				</div>
				<div class="demo-eval-row">
					<span class="demo-eval-name">CPT Rodriguez</span>
					<span class="demo-eval-type oer">OER</span>
					<span class="demo-eval-due">15 Apr 26</span>
					<span class="demo-eval-status current"><span>Current</span></span>
				</div>
				<div class="demo-eval-row">
					<span class="demo-eval-name">SSG Thompson</span>
					<span class="demo-eval-type ncoer">NCOER</span>
					<span class="demo-eval-due">28 Mar 26</span>
					<span class="demo-eval-status due-30"><span>Due 30</span></span>
				</div>
				<div class="demo-eval-row">
					<span class="demo-eval-name">SFC Williams</span>
					<span class="demo-eval-type ncoer">NCOER</span>
					<span class="demo-eval-due">12 Mar 26</span>
					<span class="demo-eval-status overdue"><span>Overdue</span></span>
				</div>
				<div class="demo-eval-row">
					<span class="demo-eval-name">CW2 Baker</span>
					<span class="demo-eval-type woer">WOER</span>
					<span class="demo-eval-due">20 May 26</span>
					<span class="demo-eval-status due-60"><span>Due 60</span></span>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="07 // Daily Assignments"
		titleBefore="Plan the duty roster "
		emphasis="in minutes."
		description="Assign MOD, CQ, staff duty, and custom roles with the same personnel picture the unit is already using. That makes it easier to balance eligibility, availability, and fairness without rebuilding the roster by hand."
		bullets={[
			'Custom assignment types for local duty requirements',
			'Roster generation based on availability and eligibility rules',
			'Month-at-a-glance planning for upcoming coverage',
			'Assignment history to support fair distribution over time'
		]}
	>
		<PublicDemoFrame label="Daily Assignments">
			<div class="demo-duty-date">Monday, 10 Mar 2026</div>
			<div class="demo-duty-list">
				<div class="demo-duty-row">
					<span class="demo-duty-badge mod">MOD</span>
					<span class="demo-duty-name">CPT Rodriguez</span>
				</div>
				<div class="demo-duty-row">
					<span class="demo-duty-badge cq">CQ</span>
					<span class="demo-duty-name">SSG Thompson</span>
				</div>
				<div class="demo-duty-row">
					<span class="demo-duty-badge staff">Staff Duty</span>
					<span class="demo-duty-name">SGT Park</span>
				</div>
				<div class="demo-duty-row">
					<span class="demo-duty-badge front-desk">Front Desk</span>
					<span class="demo-duty-name">SPC Nguyen</span>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>

	<PublicFeatureSection
		label="08 // Security & Compliance"
		titleBefore="Built for military-grade "
		emphasis="data protection."
		description="Personnel data deserves a controlled environment. TroopToTask aligns to NIST SP 800-171 expectations for unclassified handling, with access control, audit coverage, and encrypted transport built into the platform."
		bullets={[
			'NIST SP 800-171 aligned controls for CUI-oriented handling',
			'Encryption in transit and at rest',
			'Row-level isolation between organizations',
			'Comprehensive audit logging and least-privilege access defaults',
			'Multi-factor authentication support'
		]}
		reversed
		alternate
	>
		<PublicDemoFrame label="Security">
			<div class="security-status-list">
				<div class="security-status-row">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
					</svg>
					<span class="security-status-name">NIST 800-171 Controls</span>
					<span class="security-status-badge active">Active</span>
				</div>
				<div class="security-status-row">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<span class="security-status-name">AES-256 Encryption</span>
					<span class="security-status-badge active">Active</span>
				</div>
				<div class="security-status-row">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path
							d="M20 8v6M23 11h-6"
						/>
					</svg>
					<span class="security-status-name">Row-Level Isolation</span>
					<span class="security-status-badge active">Active</span>
				</div>
				<div class="security-status-row">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
							points="14 2 14 8 20 8"
						/><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
					</svg>
					<span class="security-status-name">Audit Logging</span>
					<span class="security-status-badge active">Active</span>
				</div>
				<div class="security-status-row">
					<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
					</svg>
					<span class="security-status-name">Rate Limiting</span>
					<span class="security-status-badge active">Active</span>
				</div>
			</div>
		</PublicDemoFrame>
	</PublicFeatureSection>
</PublicShell>

<style>
	.feature-rollup {
		padding: 2.5rem 2rem;
		border-bottom: 1px solid var(--border-default);
		background: var(--surface-page);
	}

	.feature-rollup__inner {
		max-width: 1180px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 2rem;
		align-items: start;
	}

	.feature-rollup__label {
		margin-bottom: 0.75rem;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
	}

	.feature-rollup h2 {
		margin: 0;
		max-width: 14ch;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: var(--font-weight-bold);
		line-height: 0.98;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.feature-rollup__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.feature-rollup__grid div {
		padding: 0.9rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--paper);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.cal-month-label,
	.demo-group-name,
	.demo-group-count,
	.demo-training-date,
	.demo-progress-text,
	.demo-soldier-info,
	.demo-timeline-date,
	.demo-eval-header span,
	.demo-eval-due,
	.security-status-name {
		font-family: var(--font-mono);
		color: var(--text-tertiary);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.cal-month-label {
		font-size: 0.62rem;
		margin-bottom: 0.75rem;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.3rem;
		margin-bottom: 1rem;
	}

	.cal-header {
		padding-bottom: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.56rem;
		text-align: center;
		color: var(--text-tertiary);
	}

	.cal-cell {
		height: 1.1rem;
		border-radius: 4px;
		background: var(--surface-subtle);
	}

	.cal-empty {
		background: var(--surface-subtle);
	}

	.cal-leave {
		background: var(--success);
	}

	.cal-tdy {
		background: var(--info);
	}

	.cal-school {
		background: color-mix(in srgb, var(--brass) 76%, var(--paper) 24%);
	}

	.cal-appt {
		background: color-mix(in srgb, var(--danger) 80%, var(--paper) 20%);
	}

	.cal-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		justify-content: center;
	}

	.cal-legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--text-tertiary);
	}

	.cal-legend-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 3px;
	}

	.demo-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1rem;
		padding: 0.65rem 0.8rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-page);
	}

	.demo-search-icon {
		width: 0.75rem;
		height: 0.75rem;
		color: var(--text-tertiary);
	}

	.demo-search-text {
		font-size: 0.72rem;
		color: var(--text-tertiary);
	}

	.demo-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		padding-bottom: 0.6rem;
		border-bottom: var(--border-thin);
	}

	.demo-group-name {
		font-size: 0.66rem;
	}

	.demo-group-count {
		padding: 3px 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--paper);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.08em;
		color: var(--text-secondary);
	}

	.demo-roster,
	.demo-training-list,
	.demo-timeline,
	.demo-checklist,
	.demo-duty-list,
	.security-status-list {
		display: grid;
		gap: 0.65rem;
	}

	.demo-roster-row,
	.demo-duty-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.demo-rank,
	.demo-duty-badge,
	.demo-training-status,
	.demo-counseling-type,
	.demo-eval-type,
	.demo-eval-status span {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 2px 7px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
	}

	.demo-rank {
		flex-shrink: 0;
		background: var(--amber-light);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 24%, transparent);
	}

	.demo-name,
	.demo-training-name,
	.demo-soldier-name,
	.demo-duty-name,
	.demo-eval-name,
	.demo-duty-date {
		color: var(--text-primary);
	}

	.demo-name,
	.demo-duty-name {
		font-size: 0.76rem;
	}

	.demo-mos {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--text-tertiary);
	}

	.demo-training-row {
		display: grid;
		gap: 0.35rem;
	}

	.demo-training-header,
	.demo-training-meta {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		align-items: center;
	}

	.demo-training-name,
	.demo-progress-names,
	.demo-timeline-summary,
	.demo-checklist-label {
		font-size: 0.7rem;
		line-height: 1.45;
	}

	.demo-training-status {
		padding: 0.18rem 0.42rem;
	}

	.demo-training-status.current {
		background: var(--success-bg);
		color: var(--success);
		border-color: color-mix(in srgb, var(--success) 20%, transparent);
	}

	.demo-training-status.expiring {
		background: var(--info-bg);
		color: var(--info);
		border-color: color-mix(in srgb, var(--info) 20%, transparent);
	}

	.demo-training-status.warn {
		background: var(--amber-light);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 24%, transparent);
	}

	.demo-training-status.expired {
		background: var(--danger-bg);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 20%, transparent);
	}

	.demo-training-bar,
	.demo-progress-bar {
		overflow: hidden;
		border-radius: 999px;
		background: var(--surface-subtle);
	}

	.demo-training-bar {
		height: 0.3rem;
	}

	.demo-training-fill,
	.demo-progress-fill {
		height: 100%;
		border-radius: inherit;
	}

	.demo-training-fill--success {
		background: var(--success);
	}

	.demo-training-fill--info {
		background: var(--info);
	}

	.demo-training-fill--amber,
	.demo-progress-fill {
		background: var(--brass);
	}

	.demo-training-fill--danger {
		background: var(--danger);
	}

	.demo-training-date,
	.demo-progress-text {
		font-size: 0.54rem;
	}

	.demo-soldier-header,
	.demo-duty-date,
	.demo-eval-header {
		padding-bottom: 0.65rem;
		border-bottom: var(--border-thin);
	}

	.demo-soldier-header {
		margin-bottom: 0.85rem;
	}

	.demo-soldier-name {
		font-size: 0.82rem;
		font-weight: var(--font-weight-medium);
	}

	.demo-soldier-info {
		font-size: 0.54rem;
	}

	.demo-timeline-entry {
		display: flex;
		gap: 0.8rem;
		align-items: flex-start;
	}

	.demo-timeline-date {
		flex: 0 0 3.5rem;
		padding-top: 0.12rem;
		font-size: 0.54rem;
	}

	.demo-timeline-content {
		flex: 1;
		min-width: 0;
	}

	.demo-timeline-top {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-bottom: 0.2rem;
	}

	.demo-counseling-type.initial,
	.demo-eval-type.oer {
		background: var(--info-bg);
		color: var(--info);
		border-color: color-mix(in srgb, var(--info) 20%, transparent);
	}

	.demo-counseling-type.quarterly,
	.demo-eval-status.current span {
		background: var(--success-bg);
		color: var(--success);
		border-color: color-mix(in srgb, var(--success) 20%, transparent);
	}

	.demo-counseling-type.event,
	.demo-eval-status.due-30 span {
		background: var(--amber-light);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 24%, transparent);
	}

	.demo-file-icon,
	.demo-timeline-summary,
	.demo-progress-names,
	.demo-checklist-label {
		color: var(--text-tertiary);
	}

	.demo-progress-header {
		margin-bottom: 1rem;
	}

	.demo-progress-bar {
		height: 0.38rem;
	}

	.demo-checklist-item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.demo-checkbox {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 1rem;
		width: 1rem;
		height: 1rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		color: var(--success);
	}

	.demo-checkbox.checked {
		border-color: color-mix(in srgb, var(--success) 28%, transparent);
		background: color-mix(in srgb, var(--success) 18%, transparent);
	}

	.demo-checklist-item.completed .demo-checklist-label {
		color: var(--text-primary);
	}

	.demo-eval-table {
		display: grid;
		gap: 0.45rem;
	}

	.demo-eval-header,
	.demo-eval-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.demo-eval-header span {
		font-size: 0.48rem;
	}

	.demo-eval-col-name,
	.demo-eval-name {
		flex: 2;
	}

	.demo-eval-col-type,
	.demo-eval-type {
		flex: 1;
	}

	.demo-eval-col-due,
	.demo-eval-due {
		flex: 1.15;
	}

	.demo-eval-col-status,
	.demo-eval-status {
		flex: 1;
		text-align: right;
	}

	.demo-eval-type.ncoer {
		background: var(--amber-light);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 24%, transparent);
	}

	.demo-eval-type.woer,
	.demo-eval-status.due-60 span {
		background: var(--success-bg);
		color: var(--success);
		border-color: color-mix(in srgb, var(--success) 20%, transparent);
	}

	.demo-eval-status.overdue span {
		background: var(--danger-bg);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 20%, transparent);
	}

	.demo-duty-date {
		margin-bottom: 0.85rem;
		font-family: var(--font-display);
		font-size: 1rem;
	}

	.demo-duty-badge {
		min-width: 4.6rem;
		padding: 0.22rem 0.45rem;
		text-align: center;
	}

	.demo-duty-badge.mod {
		background: var(--amber-light);
		color: var(--amber-dark);
		border-color: color-mix(in srgb, var(--amber) 24%, transparent);
	}

	.demo-duty-badge.cq {
		background: var(--info-bg);
		color: var(--info);
		border-color: color-mix(in srgb, var(--info) 20%, transparent);
	}

	.demo-duty-badge.staff {
		background: var(--danger-bg);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 20%, transparent);
	}

	.demo-duty-badge.front-desk {
		background: var(--paper);
		color: var(--text-tertiary);
		border-color: var(--border-default);
	}

	.security-status-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid color-mix(in srgb, var(--success) 24%, transparent);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--success) 10%, transparent);
	}

	.security-status-row svg,
	.security-status-badge.active {
		color: var(--success);
	}

	.security-status-name {
		font-size: 0.56rem;
		color: var(--text-primary);
	}

	.security-status-badge {
		margin-left: auto;
		padding: 2px 7px;
		border: 1px solid color-mix(in srgb, var(--success) 20%, transparent);
		border-radius: var(--radius-sm);
		background: var(--success-bg);
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	@media (max-width: 980px) {
		.feature-rollup__inner,
		.feature-rollup__grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 640px) {
		.feature-rollup {
			padding-inline: 1rem;
		}

		.feature-rollup__grid div {
			font-size: 0.62rem;
		}

		.cal-legend,
		.demo-training-header,
		.demo-training-meta,
		.demo-eval-header,
		.demo-eval-row {
			gap: 0.5rem;
		}

		.demo-timeline-entry {
			flex-direction: column;
			gap: 0.35rem;
		}

		.demo-timeline-date {
			flex-basis: auto;
		}

		.demo-duty-badge {
			min-width: 4rem;
		}
	}
</style>
