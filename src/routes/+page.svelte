<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data } = $props();

	const features = [
		{
			icon: 'lock',
			title: 'Security & Compliance',
			description: 'NIST 800-171 aligned. Your personnel data is encrypted at rest and in transit, access-controlled with role-based permissions, and every action is audit-logged. Built for the standards military leaders expect.',
			lead: true
		},
		{
			icon: 'calendar',
			title: 'Visual Calendar',
			description: 'See your entire unit\'s availability at a glance with color-coded statuses for leave, TDY, training, and more.'
		},
		{
			icon: 'users',
			title: 'Personnel Management',
			description: 'Organize by groups and sections. Track rank, MOS, and roles. Bulk import from spreadsheets.'
		},
		{
			icon: 'star',
			title: 'Rating Scheme Tracker',
			description: 'Track OER, NCOER, and WOER evaluations. See who\'s overdue, due in 30/60 days, and export to Excel.'
		},
		{
			icon: 'checklist',
			title: 'In-Processing Checklist',
			description: 'Custom onboarding templates with step-by-step tracking. See progress by person or pivot by step to find gaps.'
		},
		{
			icon: 'roster',
			title: 'Duty Roster Generator',
			description: 'Auto-generate fair duty rosters based on availability, eligibility, and past assignment counts.'
		},
		{
			icon: 'clipboard',
			title: 'Daily Assignments',
			description: 'Assign MOD, front desk support, and custom duties. Plan the entire month with the assignment planner.'
		},
		{
			icon: 'chart',
			title: '3-Month View',
			description: 'Long-range planning made easy. See coverage gaps before they become problems.'
		},
		{
			icon: 'certificate',
			title: 'Training Tracker',
			description: 'Track certifications with color-coded warnings at 60, 30, and 0 days before expiration.'
		},
		{
			icon: 'shield',
			title: 'Granular Permissions',
			description: 'Owner, admin, and member roles with 11 permission toggles. Scope team leaders to specific groups. Approval workflows for deletions.'
		},
		{
			icon: 'building',
			title: 'Multi-Organization',
			description: 'Manage multiple units from one account. Invite members and control access levels.'
		},
		{
			icon: 'download',
			title: 'Export & Print',
			description: 'Export to Excel with color-coding intact. Print-ready PDF for posting on the board.'
		}
	];

	const shipped = [
		{
			title: 'Digital Leaders Book',
			description: 'Centralized soldier information, counseling records, and development tracking.',
		},
		{
			title: 'Rating Scheme Tracker',
			description: 'OER, NCOER, and WOER evaluation tracking with due-status alerts and Excel export.',
		},
		{
			title: 'In-Processing Checklist',
			description: 'Custom onboarding templates with step-by-step progress tracking per person.',
		}
	];

	const roadmap = [
		{
			title: 'Email Notifications',
			description:
				'Get alerts for expiring training, coverage gaps, and assignment conflicts — plus timed daily, weekly, and monthly readiness reports delivered straight to your inbox.',
			status: 'Planned',
			statusClass: 'planned'
		},
		{
			title: 'ACFT Score Tracking & Trends',
			description:
				'Log ACFT scores for each Soldier and visualize fitness trends over time to spot readiness gaps and highlight top performers.',
			status: 'Planned',
			statusClass: 'planned'
		},
		{
			title: 'Event Sign-ups',
			description: 'Coordinate range days, ACFT, and unit events with built-in sign-up sheets.',
			status: 'Exploring',
			statusClass: 'exploring'
		},
		{
			title: 'ICTL Tracking',
			description:
				'Track Individual Critical Task List progress for each Soldier to ensure MOS and unit task proficiency.',
			status: 'Exploring',
			statusClass: 'exploring'
		}
	];

	function getFeatureIcon(icon: string) {
		const icons: Record<string, string> = {
			calendar: 'M3 4h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2zm13-2v4M8 2v4M1 10h22',
			users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
			clipboard: 'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M8 2h8a1 1 0 011 1v2a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1zM9 14l2 2 4-4',
			roster: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
			chart: 'M3 4h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2zM9 4v18M15 4v18M3 10h18M3 16h18',
			certificate: 'M12 15a7 7 0 100-14 7 7 0 000 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12',
			shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
			building: 'M4 2h16a2 2 0 012 2v16a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zM9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01',
			download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
			star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
			checklist: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6M9 14l2 2 4-4M9 11h.01',
			lock: 'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4M12 16v2'
		};
		return icons[icon] || '';
	}
</script>

<svelte:head>
	<title>Troop to Task — Army Unit Personnel Management</title>
	<meta name="description" content="The complete personnel management solution for Army units. Visual calendars, training tracking, duty assignments, and team coordination in one tool." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="landing">
	<!-- Classification Bar -->
	<div class="classification-bar">
		<span>TROOP TO TASK</span>
		<span class="classification-sep">//</span>
		<span>PERSONNEL MANAGEMENT SYSTEM</span>
	</div>

	<!-- Navigation -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-mark">T2T</div>
				<span class="nav-wordmark">Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="/features" class="nav-link">Features</a>
				<a href="/pricing" class="nav-link">Pricing</a>
				<a href="/security" class="nav-link">Security</a>
				<a href="#roadmap" class="nav-link">Roadmap</a>
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

	<!-- Hero Section -->
	<section class="hero">
		<div class="hero-noise"></div>
		<div class="hero-container">
			<div class="hero-content">
				<p class="hero-eyebrow">Replace the whiteboard. Retire the spreadsheet.</p>
				<h1 class="hero-title">
					Personnel management<br />
					<em>that actually works.</em>
				</h1>
				<p class="hero-subtitle">
					Troop to Task gives Army leaders a visual calendar, training tracker, and
					assignment planner — one tool instead of five. Free during beta.
				</p>
				<div class="hero-actions">
					{#if data.user}
						<a href="/dashboard?show=all" class="hero-btn-primary">
							Go to Dashboard
							<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
						</a>
					{:else}
						<a href="/auth/login" class="hero-btn-primary">
							Get Started Free
							<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
						</a>
					{/if}
					<a href="#features" class="hero-btn-ghost">See what's included</a>
				</div>

				<div class="hero-proof">
					<div class="proof-item">
						<span class="proof-value">Free Beta</span>
						<span class="proof-label">No credit card</span>
					</div>
					<div class="proof-divider"></div>
					<div class="proof-item">
						<span class="proof-value">5 min</span>
						<span class="proof-label">Setup time</span>
					</div>
					<div class="proof-divider"></div>
					<div class="proof-item">
						<span class="proof-value">24/7</span>
						<span class="proof-label">Availability</span>
					</div>
				</div>
			</div>

			<!-- Dashboard Preview -->
			<div class="hero-visual">
				<div class="dashboard-preview">
					<div class="compliance-sash">NIST 800-171</div>
					<div class="dash-chrome">
						<div class="dash-dots">
							<span></span><span></span><span></span>
						</div>
						<span class="dash-url">app.trooptotask.com</span>
					</div>
					<div class="dash-body">
						<div class="dash-panel dash-calendar">
							<div class="dash-panel-head">
								<span class="dash-panel-title">Calendar</span>
								<span class="dash-live">LIVE</span>
							</div>
							<div class="mini-calendar">
								<div class="cal-row cal-header">
									<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span>
								</div>
								<div class="cal-row">
									<span class="cal-empty"></span><span class="cal-leave"></span><span class="cal-leave"></span><span class="cal-empty"></span><span class="cal-empty"></span>
								</div>
								<div class="cal-row">
									<span class="cal-tdy"></span><span class="cal-tdy"></span><span class="cal-empty"></span><span class="cal-empty"></span><span class="cal-appt"></span>
								</div>
								<div class="cal-row">
									<span class="cal-empty"></span><span class="cal-empty"></span><span class="cal-school"></span><span class="cal-school"></span><span class="cal-school"></span>
								</div>
							</div>
							<div class="cal-legend">
								<span class="legend-item"><span class="legend-dot cal-leave"></span>Leave</span>
								<span class="legend-item"><span class="legend-dot cal-tdy"></span>TDY</span>
								<span class="legend-item"><span class="legend-dot cal-school"></span>School</span>
								<span class="legend-item"><span class="legend-dot cal-appt"></span>Appt</span>
							</div>
						</div>
						<div class="dash-panel dash-training">
							<div class="dash-panel-head">
								<span class="dash-panel-title">Training</span>
							</div>
							<div class="training-bars">
								<div class="training-item">
									<div class="training-meta"><span class="training-name">Weapons Qual</span><span class="training-pct">85%</span></div>
									<div class="training-bar"><div class="training-fill fill-good" style="width: 85%"></div></div>
								</div>
								<div class="training-item">
									<div class="training-meta"><span class="training-name">ACFT</span><span class="training-pct">60%</span></div>
									<div class="training-bar"><div class="training-fill fill-warn" style="width: 60%"></div></div>
								</div>
								<div class="training-item">
									<div class="training-meta"><span class="training-name">First Aid</span><span class="training-pct">25%</span></div>
									<div class="training-bar"><div class="training-fill fill-crit" style="width: 25%"></div></div>
								</div>
							</div>
						</div>
						<div class="dash-panel dash-duty">
							<div class="dash-panel-head">
								<span class="dash-panel-title">Today's Duty</span>
							</div>
							<div class="duty-list">
								<div class="duty-row"><span class="duty-role">MOD</span><span class="duty-name">CPT Rodriguez</span></div>
								<div class="duty-row"><span class="duty-role">CQ</span><span class="duty-name">SSG Thompson</span></div>
							</div>
						</div>
						<div class="dash-panel dash-coverage">
							<div class="dash-panel-head">
								<span class="dash-panel-title">Coverage</span>
							</div>
							<div class="coverage-ring">
								<svg viewBox="0 0 36 36">
									<path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
									<path class="ring-fill" stroke-dasharray="78, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
								</svg>
								<span class="coverage-value">78%</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Security Trust Strip -->
	<section class="trust-strip">
		<div class="section-container">
			<div class="trust-grid">
				<div class="trust-item">
					<svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
						<path d="M9 12l2 2 4-4"/>
					</svg>
					<div>
						<strong>NIST 800-171 Aligned</strong>
						<p>Security controls mapped to federal CUI protection standards.</p>
					</div>
				</div>
				<div class="trust-item">
					<svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
						<path d="M7 11V7a5 5 0 0110 0v4"/>
					</svg>
					<div>
						<strong>Encrypted at Rest & In Transit</strong>
						<p>AES-256 encryption for stored data. TLS 1.2+ for all connections.</p>
					</div>
				</div>
				<div class="trust-item">
					<svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="16" y1="13" x2="8" y2="13"/>
						<line x1="16" y1="17" x2="8" y2="17"/>
					</svg>
					<div>
						<strong>Full Audit Trail</strong>
						<p>Every access and change is logged. Exportable for IG inspections.</p>
					</div>
				</div>
				<div class="trust-item">
					<svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
						<circle cx="9" cy="7" r="4"/>
						<path d="M23 21v-2a4 4 0 00-3-3.87"/>
						<path d="M16 3.13a4 4 0 010 7.75"/>
					</svg>
					<div>
						<strong>Role-Based Access Control</strong>
						<p>Granular permissions with group scoping. See only what you need.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="features">
		<div class="section-container">
			<div class="section-label">Capabilities</div>
			<h2 class="section-title">Everything your unit needs,<br /><em>nothing it doesn't.</em></h2>

			<div class="features-grid">
				{#each features as feature, i}
					<div class="feature-card" class:feature-lead={feature.lead}>
						<div class="feature-number">{String(i + 1).padStart(2, '0')}</div>
						<div class="feature-body">
							<h3 class="feature-title">{feature.title}</h3>
							<p class="feature-description">{feature.description}</p>
						</div>
					</div>
				{/each}
			</div>

			<div class="features-cta">
				<a href="/features" class="features-link">
					See all features
					<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
				</a>
			</div>
		</div>
	</section>

	<!-- How It Works — compact inline -->
	<section class="onboarding">
		<div class="section-container">
			<div class="onboarding-track">
				<div class="onboarding-step">
					<span class="onboarding-num">01</span>
					<div>
						<strong>Create Your Organization</strong>
						<p>Sign up and create your unit's workspace in under a minute.</p>
					</div>
				</div>
				<div class="onboarding-connector"></div>
				<div class="onboarding-step">
					<span class="onboarding-num">02</span>
					<div>
						<strong>Add Your Personnel</strong>
						<p>Enter your roster manually or bulk import from any spreadsheet.</p>
					</div>
				</div>
				<div class="onboarding-connector"></div>
				<div class="onboarding-step">
					<span class="onboarding-num">03</span>
					<div>
						<strong>Start Tracking</strong>
						<p>Log availability, assign duties, and monitor training — live.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Roadmap Section -->
	<section id="roadmap" class="roadmap">
		<div class="section-container">
			<div class="section-label">Roadmap</div>
			<h2 class="section-title">What we've built,<br /><em>and what's next.</em></h2>

			<div class="roadmap-shipped">
				<h3 class="roadmap-group-title">Recently Shipped</h3>
				{#each shipped as item}
					<div class="shipped-entry">
						<div class="shipped-check">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</div>
						<div>
							<h4 class="shipped-title">{item.title}</h4>
							<p class="shipped-description">{item.description}</p>
						</div>
					</div>
				{/each}
			</div>

			<div class="roadmap-timeline">
				<h3 class="roadmap-group-title">Coming Next</h3>
				{#each roadmap as item, i}
					<div class="roadmap-entry">
						<div class="roadmap-marker">
							<div class="marker-dot {item.statusClass}"></div>
							{#if i < roadmap.length - 1}
								<div class="marker-line"></div>
							{/if}
						</div>
						<div class="roadmap-content">
							<div class="roadmap-status-badge {item.statusClass}">{item.status}</div>
							<h3 class="roadmap-title">{item.title}</h3>
							<p class="roadmap-description">{item.description}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta">
		<div class="cta-container">
			<h2 class="cta-title">Ready to streamline<br /><em>your unit?</em></h2>
			<p class="cta-subtitle">Currently free during beta — no credit card required. Beta testers will receive a generous grace period before any subscription is needed.</p>
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

	<!-- Footer -->
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
				<a href="#roadmap">Roadmap</a>
				<a href="/security">Security</a>
			</div>
			<div class="footer-legal">
				<a href="/terms">Terms of Use</a>
				<span class="footer-legal-sep">&middot;</span>
				<a href="/privacy">Privacy Policy</a>
			</div>
			<p class="footer-text">Built for Army leaders, by Army leaders.</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Landing Page — "Operations Directive"
	   Typography: Instrument Serif + DM Sans + DM Mono
	   ============================================ */

	.landing {
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

	:global([data-theme='dark']) .landing {
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

	/* ---- Hero ---- */
	.hero {
		position: relative;
		background: var(--hero-bg);
		padding: 6rem 2rem 5rem;
		overflow: hidden;
	}

	.hero-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	.hero-container {
		position: relative;
		z-index: 1;
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5rem;
		align-items: center;
	}

	.hero-eyebrow {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--brass);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin-bottom: 1.5rem;
	}

	.hero-title {
		font-family: var(--font-display);
		font-size: 3.75rem;
		font-weight: 400;
		line-height: 1.08;
		color: var(--hero-text);
		margin-bottom: 1.75rem;
		letter-spacing: -0.01em;
	}

	.hero-title em {
		font-style: italic;
		color: var(--brass);
	}

	.hero-subtitle {
		font-size: 1.0625rem;
		color: var(--hero-muted);
		line-height: 1.7;
		margin-bottom: 2.5rem;
		max-width: 480px;
	}

	.hero-actions {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: 3.5rem;
	}

	.hero-btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-body);
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--ink);
		background: var(--brass);
		padding: 0.75rem 1.75rem;
		border-radius: 8px;
		text-decoration: none;
		transition: all 0.2s;
	}

	.hero-btn-primary:hover {
		background: var(--brass-light);
		transform: translateY(-1px);
	}

	.hero-btn-primary svg {
		width: 16px;
		height: 16px;
	}

	.hero-btn-ghost {
		font-size: 0.9375rem;
		color: var(--hero-muted);
		text-decoration: none;
		border-bottom: 1px solid var(--ink-border);
		padding-bottom: 2px;
		transition: all 0.15s;
	}

	.hero-btn-ghost:hover {
		color: var(--hero-text);
		border-color: var(--hero-text);
	}

	.hero-proof {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.proof-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.proof-value {
		font-family: var(--font-mono);
		font-size: 1rem;
		font-weight: 500;
		color: var(--hero-text);
	}

	.proof-label {
		font-size: 0.75rem;
		color: var(--hero-muted);
	}

	.proof-divider {
		width: 1px;
		height: 28px;
		background: var(--ink-border);
	}

	/* ---- Dashboard Preview ---- */
	.hero-visual {
		display: flex;
		justify-content: center;
	}

	.dashboard-preview {
		position: relative;
		width: 100%;
		max-width: 480px;
		background: var(--ink-light);
		border: 1px solid var(--ink-border);
		border-radius: 12px;
		overflow: hidden;
		box-shadow:
			0 0 0 1px rgba(255,255,255,0.03),
			0 20px 60px rgba(0,0,0,0.4);
	}

	.compliance-sash {
		position: absolute;
		top: 18px;
		right: -34px;
		z-index: 10;
		width: 160px;
		text-align: center;
		padding: 4px 0;
		background: var(--brass);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		transform: rotate(45deg);
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
	}

	.dash-chrome {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		border-bottom: 1px solid var(--ink-border);
		background: rgba(255,255,255,0.02);
	}

	.dash-dots {
		display: flex;
		gap: 5px;
	}

	.dash-dots span {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ink-border);
	}

	.dash-url {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--hero-muted);
		letter-spacing: 0.02em;
	}

	.dash-body {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.625rem;
		padding: 0.75rem;
	}

	.dash-panel {
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.06);
		border-radius: 8px;
		padding: 0.875rem;
	}

	.dash-calendar {
		grid-column: span 2;
	}

	.dash-panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.625rem;
	}

	.dash-panel-title {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		color: var(--hero-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.dash-live {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 500;
		color: #4caf50;
		letter-spacing: 0.1em;
		padding: 0.125rem 0.375rem;
		border: 1px solid rgba(76, 175, 80, 0.3);
		border-radius: 3px;
	}

	/* Mini Calendar inside dashboard */
	.mini-calendar {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.cal-row {
		display: flex;
		gap: 3px;
	}

	.cal-row span {
		flex: 1;
		height: 20px;
		border-radius: 3px;
	}

	.cal-row.cal-header span {
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
		height: auto;
		padding-bottom: 2px;
	}

	.cal-empty { background: rgba(255,255,255,0.04); }
	.cal-leave { background: #4caf50; }
	.cal-tdy { background: #7c4dff; }
	.cal-school { background: #2196f3; }
	.cal-appt { background: #ff9800; }

	.cal-legend {
		display: flex;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.5625rem;
		color: var(--hero-muted);
		font-family: var(--font-mono);
	}

	.legend-dot {
		width: 6px;
		height: 6px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	/* Training Bars inside dashboard */
	.training-bars {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.training-item {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.training-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.training-name {
		font-size: 0.625rem;
		color: var(--hero-muted);
	}

	.training-pct {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		color: var(--hero-muted);
	}

	.training-bar {
		height: 4px;
		background: rgba(255,255,255,0.06);
		border-radius: 2px;
		overflow: hidden;
	}

	.training-fill {
		height: 100%;
		border-radius: 2px;
	}

	.fill-good { background: #4caf50; }
	.fill-warn { background: #ff9800; }
	.fill-crit { background: #f44336; }

	/* Duty inside dashboard */
	.duty-list {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.duty-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.duty-role {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		background: var(--color-primary);
		color: #0F0F0F;
		border-radius: 3px;
		letter-spacing: 0.05em;
	}

	.duty-name {
		font-size: 0.6875rem;
		color: var(--hero-muted);
	}

	/* Coverage ring */
	.dash-coverage {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.coverage-ring {
		position: relative;
		width: 64px;
		height: 64px;
	}

	.coverage-ring svg {
		transform: rotate(-90deg);
		width: 100%;
		height: 100%;
	}

	.ring-bg {
		fill: none;
		stroke: rgba(255,255,255,0.06);
		stroke-width: 3;
	}

	.ring-fill {
		fill: none;
		stroke: var(--brass);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.coverage-value {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--hero-text);
	}

	/* ---- Sections (shared) ---- */
	.section-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.section-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--brass);
		margin-bottom: 0.75rem;
	}

	.section-title {
		font-family: var(--font-display);
		font-size: 2.75rem;
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -0.01em;
		margin-bottom: 1rem;
	}

	.section-title em {
		font-style: italic;
	}

	.section-subtitle {
		font-size: 1.0625rem;
		color: var(--color-text-secondary);
		max-width: 520px;
		line-height: 1.6;
		margin: 0;
	}

	/* ---- Features ---- */
	.features {
		padding: 6rem 0;
		background: var(--paper);
	}

	:global([data-theme='dark']) .features {
		background: var(--color-bg);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1px;
		background: var(--color-border);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		overflow: hidden;
		margin-top: 3rem;
	}

	.feature-card {
		background: var(--color-surface);
		padding: 2rem;
		display: flex;
		gap: 1.25rem;
		transition: background 0.2s;
	}

	.feature-card:hover {
		background: var(--paper-warm);
	}

	:global([data-theme='dark']) .feature-card:hover {
		background: var(--color-surface-variant);
	}

	.feature-lead {
		grid-column: span 3;
		padding: 2.5rem;
	}

	.feature-number {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--brass);
		flex-shrink: 0;
		padding-top: 0.125rem;
		letter-spacing: 0.02em;
	}

	.feature-body {
		min-width: 0;
	}

	.feature-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		margin-bottom: 0.375rem;
		color: var(--color-text);
	}

	.feature-lead .feature-title {
		font-size: 1.5rem;
	}

	.feature-description {
		color: var(--color-text-secondary);
		line-height: 1.6;
		font-size: 0.9375rem;
		margin: 0;
	}

	.features-cta {
		margin-top: 2rem;
		text-align: center;
	}

	.features-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		color: var(--brass);
		text-decoration: none;
		letter-spacing: 0.02em;
		transition: color 0.15s;
	}

	.features-link:hover {
		color: var(--brass-light);
	}

	.features-link svg {
		width: 14px;
		height: 14px;
	}

	/* ---- Onboarding (How it works) ---- */
	.onboarding {
		padding: 4rem 0;
		background: var(--paper-warm);
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
	}

	:global([data-theme='dark']) .onboarding {
		background: var(--color-surface);
	}

	.onboarding-track {
		display: flex;
		align-items: flex-start;
		gap: 0;
		max-width: 960px;
		margin: 0 auto;
	}

	.onboarding-step {
		flex: 1;
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.onboarding-num {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--brass);
		padding-top: 0.125rem;
		flex-shrink: 0;
	}

	.onboarding-step strong {
		display: block;
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 400;
		margin-bottom: 0.25rem;
	}

	.onboarding-step p {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.onboarding-connector {
		width: 2rem;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-top: 0.5rem;
	}

	.onboarding-connector::after {
		content: '';
		display: block;
		width: 100%;
		height: 1px;
		background: var(--color-border);
	}

	/* ---- Roadmap ---- */
	.roadmap {
		padding: 6rem 0;
		background: var(--paper);
	}

	:global([data-theme='dark']) .roadmap {
		background: var(--color-bg);
	}

	.roadmap-timeline {
		margin-top: 3rem;
		max-width: 640px;
	}

	.roadmap-entry {
		display: flex;
		gap: 1.5rem;
	}

	.roadmap-marker {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 20px;
	}

	.marker-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid var(--color-border);
		background: var(--color-surface);
		flex-shrink: 0;
		margin-top: 0.375rem;
	}

	.marker-dot.active {
		border-color: var(--brass);
		background: var(--brass);
	}

	.marker-dot.planned {
		border-color: var(--color-primary);
	}

	.marker-dot.exploring {
		border-color: var(--color-text-muted);
	}

	.marker-line {
		width: 1px;
		flex: 1;
		background: var(--color-border);
		min-height: 2rem;
	}

	.roadmap-content {
		padding-bottom: 2rem;
	}

	.roadmap-status-badge {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 0.125rem 0.5rem;
		border-radius: 3px;
		display: inline-block;
		margin-bottom: 0.5rem;
	}

	.roadmap-status-badge.active {
		background: var(--brass-muted);
		color: var(--brass);
	}

	.roadmap-status-badge.planned {
		background: rgba(var(--color-primary-rgb), 0.1);
		color: var(--color-primary);
	}

	.roadmap-status-badge.exploring {
		background: var(--color-surface-variant);
		color: var(--color-text-muted);
	}

	.roadmap-title {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		margin-bottom: 0.25rem;
	}

	.roadmap-description {
		font-size: 0.9375rem;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.roadmap-group-title {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin-bottom: 1.25rem;
	}

	.roadmap-shipped {
		margin-top: 3rem;
		margin-bottom: 3rem;
		max-width: 640px;
	}

	.shipped-entry {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 1.25rem;
	}

	.shipped-check {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: rgba(76, 175, 80, 0.15);
		color: #4caf50;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 0.125rem;
	}

	.shipped-title {
		font-family: var(--font-display);
		font-size: 1.125rem;
		font-weight: 400;
		margin-bottom: 0.125rem;
	}

	.shipped-description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin: 0;
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

	/* ---- Trust Strip ---- */
	.trust-strip {
		padding: 3.5rem 0;
		background: var(--ink);
		border-bottom: 1px solid var(--ink-border);
	}

	.trust-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2rem;
	}

	.trust-item {
		display: flex;
		gap: 0.875rem;
		align-items: flex-start;
	}

	.trust-icon {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		color: var(--brass);
		margin-top: 0.125rem;
	}

	.trust-item strong {
		display: block;
		font-family: var(--font-body);
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--hero-text);
		margin-bottom: 0.25rem;
		letter-spacing: 0.01em;
	}

	.trust-item p {
		font-size: 0.75rem;
		color: var(--hero-muted);
		line-height: 1.5;
		margin: 0;
	}

	/* ---- Footer Legal ---- */
	.footer-legal {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.footer-legal a {
		color: var(--hero-muted);
		text-decoration: none;
		font-size: 0.75rem;
		transition: color 0.15s;
	}

	.footer-legal a:hover {
		color: var(--hero-text);
	}

	.footer-legal-sep {
		color: rgba(255,255,255,0.15);
		font-size: 0.75rem;
	}

	/* ============================================
	   Responsive — Tablet
	   ============================================ */
	@media (max-width: 1024px) {
		.hero {
			padding: 4rem 1.5rem 3.5rem;
		}

		.hero-container {
			grid-template-columns: 1fr;
			gap: 3rem;
		}

		.hero-title {
			font-size: 2.75rem;
		}

		.hero-visual {
			order: 1;
		}

		.hero-content {
			order: 0;
		}

		.dashboard-preview {
			max-width: 440px;
			margin: 0 auto;
		}

		.features-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.feature-lead {
			grid-column: span 2;
		}

		.trust-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.onboarding-track {
			flex-direction: column;
			gap: 1.5rem;
		}

		.onboarding-connector {
			width: auto;
			height: 0;
			display: none;
		}

		.section-title {
			font-size: 2.25rem;
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

		.hero {
			padding: 3rem 1rem 2.5rem;
		}

		.hero-container {
			gap: 2rem;
		}

		.hero-content {
			order: -1;
		}

		.hero-visual {
			order: 0;
		}

		.hero-eyebrow {
			font-size: 0.6875rem;
			margin-bottom: 1rem;
		}

		.hero-title {
			font-size: 2.125rem;
			margin-bottom: 1.25rem;
		}

		.hero-subtitle {
			font-size: 0.9375rem;
			margin-bottom: 2rem;
		}

		.hero-actions {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
			margin-bottom: 2.5rem;
		}

		.hero-proof {
			gap: 1rem;
		}

		.proof-value {
			font-size: 0.875rem;
		}

		.proof-label {
			font-size: 0.6875rem;
		}

		.proof-divider {
			height: 20px;
		}

		.dashboard-preview {
			max-width: 100%;
		}

		.dash-body {
			gap: 0.5rem;
			padding: 0.5rem;
		}

		.dash-panel {
			padding: 0.625rem;
		}

		.cal-row span {
			height: 16px;
		}

		.cal-legend {
			gap: 0.5rem;
		}

		.coverage-ring {
			width: 52px;
			height: 52px;
		}

		.coverage-value {
			font-size: 0.75rem;
		}

		/* Sections */
		.section-container {
			padding: 0 1rem;
		}

		.section-title {
			font-size: 1.75rem;
		}

		.features,
		.roadmap {
			padding: 4rem 0;
		}

		.features-grid {
			grid-template-columns: 1fr;
			margin-top: 2rem;
		}

		.feature-lead {
			grid-column: span 1;
		}

		.feature-card {
			padding: 1.25rem;
		}

		.feature-title {
			font-size: 1.0625rem;
		}

		.feature-lead .feature-title {
			font-size: 1.25rem;
		}

		.feature-description {
			font-size: 0.875rem;
		}

		.onboarding {
			padding: 3rem 0;
		}

		.roadmap-timeline {
			margin-top: 2rem;
		}

		.roadmap-title {
			font-size: 1.0625rem;
		}

		.roadmap-description {
			font-size: 0.875rem;
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

		.trust-grid {
			grid-template-columns: 1fr;
			gap: 1.5rem;
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
		.hero-btn-primary:hover,
		.cta-btn:hover {
			transform: none;
		}
	}
</style>
