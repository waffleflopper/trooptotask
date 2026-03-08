<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	let { data } = $props();
</script>

<svelte:head>
	<title>Features — Troop to Task</title>
	<meta name="description" content="Explore all Troop to Task features: visual calendars, personnel management, training tracking, leaders book, in-processing checklists, rating schemes, and daily assignments." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="features-page">
	<!-- Classification Bar — same as landing -->
	<div class="classification-bar">
		<span>TROOP TO TASK</span>
		<span class="classification-sep">//</span>
		<span>PERSONNEL MANAGEMENT SYSTEM</span>
	</div>

	<!-- Navigation — same as landing but Features link is active -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-mark">T2T</div>
				<span class="nav-wordmark">Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="/features" class="nav-link active">Features</a>
				<a href="/pricing" class="nav-link">Pricing</a>
				<a href="/security" class="nav-link">Security</a>
				<a href="/#roadmap" class="nav-link">Roadmap</a>
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-cta">Get Started</a>
				{/if}
			</div>

			<div class="mobile-actions">
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="nav-cta">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-cta">Sign In</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Page Header -->
	<section class="page-header">
		<div class="hero-noise"></div>
		<div class="page-header-content">
			<div class="section-label">Platform</div>
			<h1>Everything your unit needs,<br /><em>nothing it doesn't.</em></h1>
			<p>Seven core tools that replace your whiteboard, spreadsheets, and shared drives. Each one built for how Army units actually operate.</p>
		</div>
	</section>

	<!-- Section 01 — Calendar -->
	<section class="feature-section">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">01 // Calendar</div>
				<h2>See your entire unit at a glance.</h2>
				<p class="feature-desc">A visual calendar that replaces the whiteboard. Color-coded statuses make it instant to see who's available, who's on leave, and where the gaps are.</p>
				<ul>
					<li>Color-coded statuses: leave, TDY, school, appointments, and custom types</li>
					<li>Month and 3-month views for long-range planning</li>
					<li>Coverage analytics show strength percentages per day</li>
					<li>Print-ready exports for posting on the board</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Calendar</span>
						<span class="demo-live-badge">LIVE</span>
					</div>
					<div class="demo-body">
						<div class="cal-month-label">March 2026</div>
						<div class="cal-grid">
							<div class="cal-header">M</div>
							<div class="cal-header">T</div>
							<div class="cal-header">W</div>
							<div class="cal-header">T</div>
							<div class="cal-header">F</div>
							<!-- SGT Park -->
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-leave"></div>
							<div class="cal-cell cal-leave"></div>
							<div class="cal-cell cal-leave"></div>
							<div class="cal-cell cal-empty"></div>
							<!-- SPC Nguyen -->
							<div class="cal-cell cal-tdy"></div>
							<div class="cal-cell cal-tdy"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-appt"></div>
							<!-- SSG Martinez -->
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-school"></div>
							<div class="cal-cell cal-school"></div>
							<div class="cal-cell cal-school"></div>
							<!-- CPT Rodriguez -->
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<!-- SGT Thompson -->
							<div class="cal-cell cal-appt"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-empty"></div>
							<div class="cal-cell cal-leave"></div>
							<div class="cal-cell cal-leave"></div>
							<!-- SPC Davis -->
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
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 02 — Personnel (reversed) -->
	<section class="feature-section reverse">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">02 // Personnel</div>
				<h2>Organize your roster, <em>your way.</em></h2>
				<p class="feature-desc">Build your unit's roster with groups and sections. Track rank, MOS, role, and contact info. Bulk import from any spreadsheet to get started fast.</p>
				<ul>
					<li>Organize by platoon, section, or custom groups</li>
					<li>Bulk import from spreadsheets — paste or upload</li>
					<li>Track rank, MOS, role, and contact information</li>
					<li>Pin frequently-used groups for quick access</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Personnel</span>
					</div>
					<div class="demo-body">
						<div class="demo-search">
							<svg class="demo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
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
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 03 — Training -->
	<section class="feature-section">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">03 // Training</div>
				<h2>Never miss an expiration <em>again.</em></h2>
				<p class="feature-desc">Track every certification across your unit with color-coded warnings. Know at a glance who's current, who's expiring soon, and who needs retraining.</p>
				<ul>
					<li>Color-coded warnings at 60, 30, and 0 days before expiration</li>
					<li>Organization-wide training completion view</li>
					<li>Custom training types with optional expiration tracking</li>
					<li>Export to Excel with color-coding intact</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Training</span>
					</div>
					<div class="demo-body">
						<div class="demo-training-list">
							<div class="demo-training-row">
								<div class="demo-training-header">
									<span class="demo-training-name">CPR / BLS Certification</span>
									<span class="demo-training-status current">Current</span>
								</div>
								<div class="demo-training-bar">
									<div class="demo-training-fill" style="width: 85%; background: #4caf50;"></div>
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
									<div class="demo-training-fill" style="width: 42%; background: #2196f3;"></div>
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
									<div class="demo-training-fill" style="width: 22%; background: #ff9800;"></div>
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
									<div class="demo-training-fill" style="width: 0%; background: #f44336;"></div>
								</div>
								<div class="demo-training-meta">
									<span class="demo-training-date">Exp: 15 Feb 2026</span>
									<span class="demo-training-date">19 days ago</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 04 — Leaders Book (reversed) -->
	<section class="feature-section reverse">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">04 // Leaders Book</div>
				<h2>Your digital counseling <em>packet.</em></h2>
				<p class="feature-desc">Centralize soldier information, counseling records, and development goals. Upload supporting documents and track follow-ups — all in one place.</p>
				<ul>
					<li>Counseling records with PDF upload and download</li>
					<li>Development goal tracking and follow-ups</li>
					<li>Chronological timeline per soldier</li>
					<li>Custom counseling types (initial, quarterly, event-based)</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Leaders Book</span>
					</div>
					<div class="demo-body">
						<div class="demo-soldier-header">
							<div>
								<div class="demo-soldier-name">SSG Martinez, Carlos J.</div>
								<div class="demo-soldier-info">11B — 1st Platoon, Alpha Co</div>
							</div>
						</div>
						<div class="demo-timeline">
							<div class="demo-timeline-entry">
								<div class="demo-timeline-date">06 Mar 26</div>
								<div class="demo-timeline-content">
									<div class="demo-timeline-top">
										<span class="demo-counseling-type event">Event</span>
										<svg class="demo-file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"/>
										</svg>
									</div>
									<div class="demo-timeline-summary">Excellence during FTX — led squad through night land nav with zero incidents</div>
								</div>
							</div>
							<div class="demo-timeline-entry">
								<div class="demo-timeline-date">15 Jan 26</div>
								<div class="demo-timeline-content">
									<div class="demo-timeline-top">
										<span class="demo-counseling-type quarterly">Quarterly</span>
									</div>
									<div class="demo-timeline-summary">On track for promotion; recommended for BLC next quarter</div>
								</div>
							</div>
							<div class="demo-timeline-entry">
								<div class="demo-timeline-date">02 Oct 25</div>
								<div class="demo-timeline-content">
									<div class="demo-timeline-top">
										<span class="demo-counseling-type initial">Initial</span>
										<svg class="demo-file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.49"/>
										</svg>
									</div>
									<div class="demo-timeline-summary">Initial counseling — duties, expectations, and development plan</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 05 — In-Processing -->
	<section class="feature-section">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">05 // In-Processing</div>
				<h2>Onboard new personnel <em>with confidence.</em></h2>
				<p class="feature-desc">Create custom in-processing templates and track each step per soldier. Pivot by step to see which personnel still need a specific action.</p>
				<ul>
					<li>Customizable step templates per organization</li>
					<li>Per-person progress tracking with completion dates</li>
					<li>Pivot-by-step report shows gaps across the unit</li>
					<li>Track multiple new arrivals simultaneously</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">In-Processing</span>
					</div>
					<div class="demo-body">
						<div class="demo-progress-header">
							<div class="demo-progress-names">SPC Davis, Jordan L. &nbsp;&bull;&nbsp; PFC Chen, Michael W.</div>
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
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								</div>
								<span class="demo-checklist-label">DEERS Enrollment</span>
							</div>
							<div class="demo-checklist-item completed">
								<div class="demo-checkbox checked">
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								</div>
								<span class="demo-checklist-label">CAC Card Pickup</span>
							</div>
							<div class="demo-checklist-item completed">
								<div class="demo-checkbox checked">
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								</div>
								<span class="demo-checklist-label">Unit Welcome Brief</span>
							</div>
							<div class="demo-checklist-item completed">
								<div class="demo-checkbox checked">
									<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="20 6 9 17 4 12"/>
									</svg>
								</div>
								<span class="demo-checklist-label">Barracks Assignment</span>
							</div>
							<div class="demo-checklist-item">
								<div class="demo-checkbox"></div>
								<span class="demo-checklist-label">Personnel Data Sheet</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 06 — Rating Scheme (reversed) -->
	<section class="feature-section reverse">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">06 // Rating Scheme</div>
				<h2>Stay ahead of <em>every evaluation.</em></h2>
				<p class="feature-desc">Track OER, NCOER, and WOER evaluations across your unit. Color-coded due-status alerts make it impossible to miss an upcoming report.</p>
				<ul>
					<li>OER, NCOER, and WOER evaluation support</li>
					<li>Due-status alerts: overdue, due in 30, and due in 60 days</li>
					<li>Dashboard summary card with at-a-glance counts</li>
					<li>Export to Excel for reporting and filing</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Rating Scheme</span>
					</div>
					<div class="demo-body">
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
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 07 — Daily Assignments -->
	<section class="feature-section">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">07 // Daily Assignments</div>
				<h2>Plan the duty roster <em>in minutes.</em></h2>
				<p class="feature-desc">Assign MOD, CQ, staff duty, and custom roles. Auto-generate fair rosters based on availability and past assignment counts.</p>
				<ul>
					<li>Custom assignment types (MOD, CQ, Staff Duty, and more)</li>
					<li>Auto-generate rosters based on availability and eligibility</li>
					<li>Month-at-a-glance assignment planner</li>
					<li>Fair distribution tracking with assignment counts</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Daily Assignments</span>
					</div>
					<div class="demo-body">
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
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Section 08 — Security & Compliance (reversed) -->
	<section class="feature-section reverse">
		<div class="feature-section-inner">
			<div class="feature-text">
				<div class="feature-label">08 // Security & Compliance</div>
				<h2>Built for military-grade <em>data protection.</em></h2>
				<p class="feature-desc">Your personnel data deserves the same standard of protection you bring to your mission. TroopToTask aligns with NIST SP 800-171 controls for Controlled Unclassified Information.</p>
				<ul>
					<li>NIST SP 800-171 aligned for CUI protection</li>
					<li>End-to-end encryption in transit and at rest</li>
					<li>Row-level data isolation between organizations</li>
					<li>Comprehensive audit logging of all data access</li>
					<li>Role-based access controls with least-privilege defaults</li>
					<li>Multi-factor authentication support</li>
				</ul>
			</div>
			<div class="feature-demo">
				<div class="demo-panel">
					<div class="demo-chrome">
						<div class="demo-dots"><span></span><span></span><span></span></div>
						<span class="demo-label">Security</span>
					</div>
					<div class="demo-body">
						<div class="security-status-list">
							<div class="security-status-row">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
								<span class="security-status-name">NIST 800-171 Controls</span>
								<span class="security-status-badge active">Active</span>
							</div>
							<div class="security-status-row">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
								<span class="security-status-name">AES-256 Encryption</span>
								<span class="security-status-badge active">Active</span>
							</div>
							<div class="security-status-row">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
								<span class="security-status-name">Row-Level Isolation</span>
								<span class="security-status-badge active">Active</span>
							</div>
							<div class="security-status-row">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
								<span class="security-status-name">Audit Logging</span>
								<span class="security-status-badge active">Active</span>
							</div>
							<div class="security-status-row">
								<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
								<span class="security-status-name">Rate Limiting</span>
								<span class="security-status-badge active">Active</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA Section — same as landing -->
	<section class="cta">
		<div class="cta-container">
			<h2 class="cta-title">Ready to streamline<br /><em>your unit?</em></h2>
			<p class="cta-subtitle">Free to use. No credit card. Set up in minutes.</p>
			{#if data.user}
				<a href="/dashboard?show=all" class="cta-btn">
					Go to Dashboard
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
				</a>
			{:else}
				<a href="/auth/login" class="cta-btn">
					Get Started Free
					<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
				</a>
			{/if}
		</div>
	</section>

	<!-- Footer — same as landing -->
	<footer class="footer">
		<div class="footer-container">
			<div class="footer-brand">
				<div class="footer-mark">T2T</div>
				<span>Troop to Task</span>
			</div>
			<div class="footer-links">
				<a href="/help">Help</a>
				<a href="/features">Features</a>
				<a href="/pricing">Pricing</a>
				<a href="/#roadmap">Roadmap</a>
				<a href="/security">Security</a>
			</div>
			<p class="footer-text">Built for Army leaders, by Army leaders.</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Features Page — reuses "Operations Directive" design system
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

	.features-page {
		--font-display: 'Instrument Serif', Georgia, 'Times New Roman', serif;
		--font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
		--font-mono: 'DM Mono', 'Menlo', monospace;
		--brass: #B8943E;
		--brass-light: #D4B15A;
		--brass-muted: rgba(184, 148, 62, 0.15);
		--ink: #0F0F0F;
		--ink-light: #1A1A1A;
		--ink-border: #2A2A2A;
		--paper: #FAFAF8;
		--paper-warm: #F5F4F0;
		--hero-bg: var(--ink);
		--hero-text: #F0EDE6;
		--hero-muted: #8A8780;
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-body);
		overflow-x: hidden;
	}

	:global([data-theme='dark']) .features-page {
		--paper: var(--color-bg);
		--paper-warm: var(--color-surface);
	}

	/* ---- Classification Bar ---- */
	.classification-bar {
		background: var(--ink);
		color: var(--hero-muted);
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		text-align: center;
		padding: 0.375rem 1rem;
		border-bottom: 1px solid var(--ink-border);
	}

	.classification-sep {
		color: var(--brass);
		margin: 0 0.75rem;
	}

	/* ---- Navigation ---- */
	.nav {
		position: sticky;
		top: 0;
		z-index: 100;
		background: var(--ink);
		border-bottom: 1px solid var(--ink-border);
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		text-decoration: none;
		color: var(--hero-text);
	}

	.nav-mark {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: var(--brass);
		color: var(--ink);
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
		line-height: 1;
	}

	.nav-wordmark {
		font-family: var(--font-display);
		font-size: 1.25rem;
		letter-spacing: -0.01em;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.nav-link {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 400;
		transition: color 0.15s;
		letter-spacing: 0.01em;
	}

	.nav-link:hover {
		color: var(--hero-text);
	}

	.nav-link.active {
		color: var(--hero-text);
	}

	.theme-toggle {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		border: 1px solid var(--ink-border);
		background: transparent;
		color: var(--hero-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.theme-toggle:hover {
		color: var(--hero-text);
		border-color: var(--hero-muted);
	}

	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	.nav-cta {
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--brass);
		padding: 0.4rem 1rem;
		border-radius: 6px;
		text-decoration: none;
		letter-spacing: 0.02em;
		transition: all 0.15s;
	}

	.nav-cta:hover {
		background: var(--brass-light);
	}

	.mobile-actions {
		display: none;
		align-items: center;
		gap: 0.75rem;
	}

	/* ---- Page Header ---- */
	.page-header {
		position: relative;
		background: var(--ink);
		padding: 5rem 2rem 4rem;
		overflow: hidden;
		text-align: center;
	}

	.page-header-content {
		position: relative;
		z-index: 1;
		max-width: 720px;
		margin: 0 auto;
	}

	.page-header h1 {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 400;
		color: var(--hero-text);
		margin-bottom: 1rem;
		line-height: 1.15;
	}

	.page-header h1 em {
		font-style: italic;
		color: var(--brass);
	}

	.page-header p {
		font-size: 1.0625rem;
		color: var(--hero-muted);
		max-width: 560px;
		margin: 0 auto;
		line-height: 1.7;
	}

	.page-header .section-label {
		margin-bottom: 1rem;
	}

	.hero-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	/* ---- Sections (shared) ---- */
	.section-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	/* ---- CTA ---- */
	.cta {
		padding: 6rem 0;
		background: var(--ink);
		position: relative;
		overflow: hidden;
	}

	.cta::before {
		content: '';
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	.cta-container {
		max-width: 700px;
		margin: 0 auto;
		padding: 0 2rem;
		text-align: center;
		position: relative;
	}

	.cta-title {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 400;
		color: var(--hero-text);
		margin-bottom: 1rem;
		line-height: 1.1;
	}

	.cta-title em {
		font-style: italic;
		color: var(--brass);
	}

	.cta-subtitle {
		font-size: 1.0625rem;
		color: var(--hero-muted);
		margin-bottom: 2.5rem;
	}

	.cta-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--brass);
		padding: 0.875rem 2rem;
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.2s;
	}

	.cta-btn:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.cta-btn svg {
		width: 16px;
		height: 16px;
	}

	/* ---- Footer ---- */
	.footer {
		padding: 1.5rem 0;
		background: var(--ink);
		border-top: 1px solid var(--ink-border);
	}

	.footer-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		color: var(--hero-muted);
		font-size: 0.875rem;
	}

	.footer-mark {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: var(--ink-border);
		color: var(--hero-muted);
		padding: 0.2rem 0.375rem;
		border-radius: 3px;
		line-height: 1;
	}

	.footer-links {
		display: flex;
		gap: 1.5rem;
	}

	.footer-links a {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		transition: color 0.15s;
	}

	.footer-links a:hover {
		color: var(--hero-text);
	}

	.footer-text {
		color: rgba(255,255,255,0.2);
		font-size: 0.75rem;
		margin: 0;
	}

	/* ---- Feature Sections (alternating layout) ---- */
	.feature-section {
		padding: 6rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.feature-section:nth-child(even of .feature-section) {
		background: var(--paper-warm);
	}

	:global([data-theme='dark']) .feature-section:nth-child(even of .feature-section) {
		background: var(--color-surface);
	}

	.feature-section-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5rem;
		align-items: center;
	}

	.feature-section.reverse .feature-section-inner {
		direction: rtl;
	}

	.feature-section.reverse .feature-section-inner > * {
		direction: ltr;
	}

	.feature-text .feature-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	.feature-text h2 {
		font-family: var(--font-display);
		font-size: 2.25rem;
		font-weight: 400;
		line-height: 1.15;
		margin-bottom: 1rem;
	}

	.feature-text h2 em {
		font-style: italic;
	}

	.feature-text .feature-desc {
		font-size: 1rem;
		color: var(--color-text-secondary);
		line-height: 1.7;
		margin-bottom: 1.5rem;
	}

	.feature-text ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.feature-text li {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.feature-text li::before {
		content: '';
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--brass);
		flex-shrink: 0;
		margin-top: 0.5rem;
	}

	/* ---- Shared Demo Panel ---- */
	.demo-panel {
		background: var(--ink-light);
		border: 1px solid var(--ink-border);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 0 0 1px rgba(255,255,255,0.03), 0 20px 60px rgba(0,0,0,0.3);
	}

	.demo-chrome {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		border-bottom: 1px solid var(--ink-border);
		background: rgba(255,255,255,0.02);
	}

	.demo-dots {
		display: flex;
		gap: 5px;
	}

	.demo-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink-border);
	}

	.demo-label {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--hero-muted);
		letter-spacing: 0.02em;
	}

	.demo-live-badge {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #4caf50;
		background: rgba(76, 175, 80, 0.12);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		margin-left: auto;
	}

	.demo-body {
		padding: 1.25rem;
	}

	/* ---- Calendar Demo ---- */
	.cal-month-label {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--hero-muted);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-bottom: 0.75rem;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 4px;
		margin-bottom: 1rem;
	}

	.cal-header {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		text-align: center;
		padding-bottom: 0.375rem;
	}

	.cal-cell {
		border-radius: 4px;
		height: 18px;
	}

	.cal-empty {
		background: rgba(255,255,255,0.04);
	}

	.cal-leave {
		background: #4caf50;
	}

	.cal-tdy {
		background: #7c4dff;
	}

	.cal-school {
		background: #2196f3;
	}

	.cal-appt {
		background: #ff9800;
	}

	.cal-legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.cal-legend-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
	}

	.cal-legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		display: inline-block;
	}

	/* ---- Personnel Demo ---- */
	.demo-search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		border: 1px solid rgba(255,255,255,0.1);
		background: rgba(255,255,255,0.03);
		margin-bottom: 1rem;
	}

	.demo-search-text {
		font-size: 0.6875rem;
		color: var(--hero-muted);
	}

	.demo-search-icon {
		width: 12px;
		height: 12px;
		color: var(--hero-muted);
	}

	.demo-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.625rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
	}

	.demo-group-name {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--hero-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.demo-group-count {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		background: rgba(255,255,255,0.06);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.demo-roster {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.demo-roster-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 0;
	}

	.demo-rank {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		background: var(--brass-muted);
		color: var(--brass);
		border-radius: 3px;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}

	.demo-name {
		font-size: 0.75rem;
		color: var(--hero-text);
		flex: 1;
	}

	.demo-mos {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
	}

	/* ---- Training Demo ---- */
	.demo-training-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.demo-training-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.demo-training-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.demo-training-name {
		font-size: 0.6875rem;
		color: var(--hero-text);
	}

	.demo-training-status {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.demo-training-status.current {
		background: rgba(76, 175, 80, 0.15);
		color: #4caf50;
	}

	.demo-training-status.warn {
		background: rgba(255, 152, 0, 0.15);
		color: #ff9800;
	}

	.demo-training-status.expiring {
		background: rgba(33, 150, 243, 0.15);
		color: #2196f3;
	}

	.demo-training-status.expired {
		background: rgba(244, 67, 54, 0.15);
		color: #f44336;
	}

	.demo-training-bar {
		height: 4px;
		background: rgba(255,255,255,0.06);
		border-radius: 2px;
		overflow: hidden;
	}

	.demo-training-fill {
		height: 100%;
		border-radius: 2px;
	}

	.demo-training-meta {
		display: flex;
		justify-content: space-between;
	}

	.demo-training-date {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
	}

	/* ---- Leaders Book Demo ---- */
	.demo-soldier-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
	}

	.demo-soldier-name {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--hero-text);
	}

	.demo-soldier-info {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
	}

	.demo-timeline {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.demo-timeline-entry {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.demo-timeline-date {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		min-width: 52px;
		padding-top: 0.125rem;
		flex-shrink: 0;
	}

	.demo-timeline-content {
		flex: 1;
		min-width: 0;
	}

	.demo-timeline-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.demo-counseling-type {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.demo-counseling-type.initial {
		background: rgba(33, 150, 243, 0.15);
		color: #2196f3;
	}

	.demo-counseling-type.quarterly {
		background: rgba(76, 175, 80, 0.15);
		color: #4caf50;
	}

	.demo-counseling-type.event {
		background: rgba(255, 152, 0, 0.15);
		color: #ff9800;
	}

	.demo-file-icon {
		color: var(--hero-muted);
		flex-shrink: 0;
	}

	.demo-timeline-summary {
		font-size: 0.6875rem;
		color: var(--hero-muted);
		line-height: 1.4;
	}

	/* ---- In-Processing Demo ---- */
	.demo-progress-header {
		margin-bottom: 1rem;
	}

	.demo-progress-names {
		font-size: 0.6875rem;
		color: var(--hero-text);
		margin-bottom: 0.5rem;
	}

	.demo-progress-bar-container {
		margin-bottom: 0.375rem;
	}

	.demo-progress-bar {
		height: 6px;
		background: rgba(255,255,255,0.06);
		border-radius: 3px;
		overflow: hidden;
	}

	.demo-progress-fill {
		height: 100%;
		background: var(--brass);
		border-radius: 3px;
	}

	.demo-progress-text {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		margin-top: 0.25rem;
	}

	.demo-checklist {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.demo-checklist-item {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.375rem 0;
	}

	.demo-checkbox {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1.5px solid rgba(255,255,255,0.15);
		background: transparent;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.demo-checkbox.checked {
		background: rgba(76, 175, 80, 0.15);
		border-color: #4caf50;
		color: #4caf50;
	}

	.demo-checklist-label {
		font-size: 0.6875rem;
		color: var(--hero-muted);
	}

	.demo-checklist-item.completed .demo-checklist-label {
		color: var(--hero-text);
	}

	/* ---- Rating Scheme Demo ---- */
	.demo-eval-table {
		width: 100%;
	}

	.demo-eval-header {
		display: flex;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		margin-bottom: 0.625rem;
	}

	.demo-eval-header span {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		color: var(--hero-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.demo-eval-col-name { flex: 2; }
	.demo-eval-col-type { flex: 1; }
	.demo-eval-col-due { flex: 1.2; }
	.demo-eval-col-status { flex: 1; text-align: right; }

	.demo-eval-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0;
	}

	.demo-eval-name {
		font-size: 0.6875rem;
		color: var(--hero-text);
		flex: 2;
	}

	.demo-eval-type {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		flex: 1;
	}

	.demo-eval-type.oer {
		background: rgba(33, 150, 243, 0.15);
		color: #2196f3;
	}

	.demo-eval-type.ncoer {
		background: rgba(156, 39, 176, 0.15);
		color: #ab47bc;
	}

	.demo-eval-type.woer {
		background: rgba(0, 150, 136, 0.15);
		color: #26a69a;
	}

	.demo-eval-due {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		flex: 1.2;
	}

	.demo-eval-status {
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		flex: 1;
		text-align: right;
	}

	.demo-eval-status span {
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.demo-eval-status.current span {
		background: rgba(76, 175, 80, 0.15);
		color: #4caf50;
	}

	.demo-eval-status.due-30 span {
		background: rgba(255, 152, 0, 0.15);
		color: #ff9800;
	}

	.demo-eval-status.overdue span {
		background: rgba(244, 67, 54, 0.15);
		color: #f44336;
	}

	.demo-eval-status.due-60 span {
		background: rgba(33, 150, 243, 0.15);
		color: #2196f3;
	}

	/* ---- Daily Assignments Demo ---- */
	.demo-duty-date {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--hero-text);
		margin-bottom: 1rem;
		padding-bottom: 0.625rem;
		border-bottom: 1px solid rgba(255,255,255,0.06);
	}

	.demo-duty-list {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.demo-duty-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.demo-duty-badge {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		min-width: 72px;
		text-align: center;
	}

	.demo-duty-badge.mod {
		background: var(--brass-muted);
		color: var(--brass);
	}

	.demo-duty-badge.cq {
		background: rgba(33, 150, 243, 0.15);
		color: #2196f3;
	}

	.demo-duty-badge.staff {
		background: rgba(156, 39, 176, 0.15);
		color: #ab47bc;
	}

	.demo-duty-badge.front-desk {
		background: rgba(255,255,255,0.06);
		color: var(--hero-muted);
	}

	.demo-duty-name {
		font-size: 0.75rem;
		color: var(--hero-text);
	}

	/* ---- Security Demo ---- */
	.security-status-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.security-status-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		background: rgba(56, 189, 108, 0.06);
		border: 1px solid rgba(56, 189, 108, 0.15);
		border-radius: 6px;
	}

	.security-status-row svg {
		color: #38bd6c;
		flex-shrink: 0;
	}

	.security-status-name {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--hero-text);
	}

	.security-status-badge {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.5rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.security-status-badge.active {
		background: rgba(56, 189, 108, 0.15);
		color: #38bd6c;
	}

	/* ============================================
	   Responsive — Tablet
	   ============================================ */
	@media (max-width: 1024px) {
		.page-header {
			padding: 4rem 1.5rem 3rem;
		}

		.page-header h1 {
			font-size: 2.5rem;
		}

		.feature-section {
			padding: 4rem 0;
		}

		.feature-section-inner {
			gap: 3rem;
		}

		.feature-text h2 {
			font-size: 1.875rem;
		}
	}

	/* ============================================
	   Responsive — Mobile
	   ============================================ */
	@media (max-width: 640px) {
		.classification-bar {
			font-size: 0.5625rem;
			padding: 0.25rem 0.75rem;
		}

		.classification-sep {
			margin: 0 0.375rem;
		}

		.nav-container {
			padding: 0 1rem;
			height: 48px;
		}

		.nav-links {
			display: none;
		}

		.mobile-actions {
			display: flex;
		}

		.nav-wordmark {
			font-size: 1.0625rem;
		}

		.page-header {
			padding: 3rem 1rem 2.5rem;
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.page-header p {
			font-size: 0.9375rem;
		}

		.feature-section {
			padding: 3rem 0;
		}

		.feature-section-inner {
			grid-template-columns: 1fr;
			gap: 2rem;
			padding: 0 1rem;
		}

		.feature-section.reverse .feature-section-inner {
			direction: ltr;
		}

		.feature-text h2 {
			font-size: 1.75rem;
		}

		.cta {
			padding: 4rem 0;
		}

		.cta-title {
			font-size: 2rem;
		}

		.cta-subtitle {
			font-size: 0.9375rem;
		}

		.footer-container {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.footer-links {
			gap: 1rem;
		}
	}

	/* ============================================
	   Reduced Motion
	   ============================================ */
	@media (prefers-reduced-motion: reduce) {
		.cta-btn:hover {
			transform: none;
		}
	}
</style>
