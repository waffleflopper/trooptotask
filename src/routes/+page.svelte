<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data } = $props();

	const features = [
		{
			icon: 'calendar',
			title: 'Visual Calendar',
			description: 'See your entire unit\'s availability at a glance with color-coded statuses for leave, TDY, training, and more.',
			highlight: true
		},
		{
			icon: 'users',
			title: 'Personnel Management',
			description: 'Organize by groups and sections. Track rank, MOS, and roles. Bulk import from spreadsheets.'
		},
		{
			icon: 'clipboard',
			title: 'Daily Assignments',
			description: 'Assign MOD, front desk support, and custom duties. Plan the entire month with the assignment planner.'
		},
		{
			icon: 'roster',
			title: 'Duty Roster Generator',
			description: 'Auto-generate fair duty rosters based on availability, eligibility, and past assignment counts.'
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
			description: 'Set view/edit permissions for calendar, personnel, and training per team member.'
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

	const roadmap = [
		{
			icon: 'book',
			title: 'Digital Leaders Book',
			description: 'Centralized soldier information, counseling records, and leader tools.',
			status: 'In Development'
		},
		{
			icon: 'signup',
			title: 'Event Sign-ups',
			description: 'Coordinate range days, ACFT, and unit events with built-in sign-up sheets.',
			status: 'Planned'
		},
		{
			icon: 'bell',
			title: 'Smart Notifications',
			description: 'Get alerts for expiring training, coverage gaps, and assignment conflicts.',
			status: 'Planned'
		},
		{
			icon: 'mobile',
			title: 'Mobile App',
			description: 'Native iOS and Android apps for on-the-go access and push notifications.',
			status: 'Exploring'
		}
	];

	const stats = [
		{ value: '100%', label: 'Free to Use' },
		{ value: '< 5min', label: 'Setup Time' },
		{ value: '24/7', label: 'Availability' }
	];
</script>

<svelte:head>
	<title>Troop to Task - Army Unit Personnel Management</title>
	<meta name="description" content="The complete personnel management solution for Army units. Visual calendars, training tracking, duty assignments, and team coordination in one tool." />
</svelte:head>

<div class="landing">
	<!-- Navigation -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-logo">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
						<line x1="16" y1="2" x2="16" y2="6"/>
						<line x1="8" y1="2" x2="8" y2="6"/>
						<line x1="3" y1="10" x2="21" y2="10"/>
					</svg>
				</div>
				<span>Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="#features" class="nav-link">Features</a>
				<a href="#roadmap" class="nav-link">Roadmap</a>
				<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="5"/>
							<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="btn btn-primary">Dashboard</a>
				{:else}
					<a href="/auth/login" class="btn btn-primary">Get Started</a>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<div class="mobile-actions">
				<button class="theme-toggle mobile" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
					{#if themeStore.isDark}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="5"/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
						</svg>
					{/if}
				</button>
				{#if data.user}
					<a href="/dashboard?show=all" class="btn btn-primary btn-sm">Dashboard</a>
				{:else}
					<a href="/auth/login" class="btn btn-primary btn-sm">Sign In</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="hero">
		<div class="hero-bg">
			<div class="hero-gradient"></div>
			<div class="hero-grid"></div>
		</div>
		<div class="hero-container">
			<div class="hero-content">
				<div class="hero-badge">
					<span class="badge-dot"></span>
					Built for Army Units
				</div>
				<h1 class="hero-title">
					Personnel Management
					<span class="hero-highlight">That Actually Works</span>
				</h1>
				<p class="hero-subtitle">
					Stop juggling spreadsheets, whiteboards, and group texts. Troop to Task gives you
					a visual calendar, training tracker, and assignment planner — all in one place.
				</p>
				<div class="hero-actions">
					{#if data.user}
						<a href="/dashboard?show=all" class="btn btn-primary btn-lg">
							Go to Dashboard
							<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
								<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</a>
					{:else}
						<a href="/auth/login" class="btn btn-primary btn-lg">
							Get Started Free
							<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
								<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</a>
					{/if}
					<a href="#features" class="btn btn-glass btn-lg">
						Explore Features
					</a>
				</div>

				<!-- Stats -->
				<div class="hero-stats">
					{#each stats as stat}
						<div class="stat">
							<span class="stat-value">{stat.value}</span>
							<span class="stat-label">{stat.label}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Hero Visual - Bento Grid Preview -->
			<div class="hero-visual">
				<div class="bento-grid">
					<div class="bento-card bento-calendar">
						<div class="bento-header">
							<span class="bento-title">Calendar</span>
							<span class="bento-badge">Live</span>
						</div>
						<div class="mini-calendar">
							<div class="cal-row cal-header">
								<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span>
							</div>
							<div class="cal-row">
								<span></span><span class="status leave"></span><span class="status leave"></span><span></span><span></span>
							</div>
							<div class="cal-row">
								<span class="status tdy"></span><span class="status tdy"></span><span></span><span></span><span class="status appt"></span>
							</div>
							<div class="cal-row">
								<span></span><span></span><span class="status school"></span><span class="status school"></span><span class="status school"></span>
							</div>
						</div>
					</div>
					<div class="bento-card bento-training">
						<div class="bento-header">
							<span class="bento-title">Training</span>
						</div>
						<div class="training-bars">
							<div class="training-item">
								<span class="training-name">Weapons Qual</span>
								<div class="training-bar">
									<div class="training-fill green" style="width: 85%"></div>
								</div>
							</div>
							<div class="training-item">
								<span class="training-name">ACFT</span>
								<div class="training-bar">
									<div class="training-fill yellow" style="width: 60%"></div>
								</div>
							</div>
							<div class="training-item">
								<span class="training-name">First Aid</span>
								<div class="training-bar">
									<div class="training-fill red" style="width: 25%"></div>
								</div>
							</div>
						</div>
					</div>
					<div class="bento-card bento-roster">
						<div class="bento-header">
							<span class="bento-title">Today's Duty</span>
						</div>
						<div class="roster-list">
							<div class="roster-item">
								<span class="roster-role">MOD</span>
								<span class="roster-name">CPT Rodriguez</span>
							</div>
							<div class="roster-item">
								<span class="roster-role">CQ</span>
								<span class="roster-name">SSG Thompson</span>
							</div>
						</div>
					</div>
					<div class="bento-card bento-stats">
						<div class="bento-header">
							<span class="bento-title">Coverage</span>
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
	</section>

	<!-- Features Section -->
	<section id="features" class="features">
		<div class="section-container">
			<div class="section-header">
				<span class="section-badge">Features</span>
				<h2 class="section-title">Everything Your Unit Needs</h2>
				<p class="section-subtitle">
					Purpose-built tools designed by Army leaders, for Army leaders
				</p>
			</div>

			<div class="features-grid">
				{#each features as feature, i}
					<div class="feature-card" class:highlight={feature.highlight}>
						<div class="feature-icon">
							{#if feature.icon === 'calendar'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
								</svg>
							{:else if feature.icon === 'users'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
									<circle cx="9" cy="7" r="4"/>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
									<path d="M16 3.13a4 4 0 0 1 0 7.75"/>
								</svg>
							{:else if feature.icon === 'clipboard'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
									<rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
									<path d="M9 14l2 2 4-4"/>
								</svg>
							{:else if feature.icon === 'roster'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
									<polyline points="14 2 14 8 20 8"/>
									<line x1="16" y1="13" x2="8" y2="13"/>
									<line x1="16" y1="17" x2="8" y2="17"/>
									<polyline points="10 9 9 9 8 9"/>
								</svg>
							{:else if feature.icon === 'chart'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
									<line x1="9" y1="4" x2="9" y2="22"/>
									<line x1="15" y1="4" x2="15" y2="22"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
									<line x1="3" y1="16" x2="21" y2="16"/>
								</svg>
							{:else if feature.icon === 'certificate'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="8" r="7"/>
									<polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
								</svg>
							{:else if feature.icon === 'shield'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
									<path d="M9 12l2 2 4-4"/>
								</svg>
							{:else if feature.icon === 'building'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
									<path d="M9 22v-4h6v4"/>
									<line x1="8" y1="6" x2="8" y2="6"/>
									<line x1="12" y1="6" x2="12" y2="6"/>
									<line x1="16" y1="6" x2="16" y2="6"/>
									<line x1="8" y1="10" x2="8" y2="10"/>
									<line x1="12" y1="10" x2="12" y2="10"/>
									<line x1="16" y1="10" x2="16" y2="10"/>
								</svg>
							{:else if feature.icon === 'download'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
									<polyline points="7 10 12 15 17 10"/>
									<line x1="12" y1="15" x2="12" y2="3"/>
								</svg>
							{/if}
						</div>
						<h3 class="feature-title">{feature.title}</h3>
						<p class="feature-description">{feature.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- How It Works -->
	<section class="how-it-works">
		<div class="section-container">
			<div class="section-header">
				<span class="section-badge">Getting Started</span>
				<h2 class="section-title">Up and Running in Minutes</h2>
				<p class="section-subtitle">No complex setup or training required</p>
			</div>

			<div class="steps-container">
				<div class="steps-line"></div>
				<div class="steps-grid">
					<div class="step">
						<div class="step-number">1</div>
						<div class="step-content">
							<h3>Create Your Organization</h3>
							<p>Sign up and create your unit's workspace. It takes less than a minute.</p>
						</div>
					</div>
					<div class="step">
						<div class="step-number">2</div>
						<div class="step-content">
							<h3>Add Your Personnel</h3>
							<p>Enter your roster manually or bulk import from any spreadsheet.</p>
						</div>
					</div>
					<div class="step">
						<div class="step-number">3</div>
						<div class="step-content">
							<h3>Start Tracking</h3>
							<p>Log availability, assign duties, and monitor training in real-time.</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Roadmap Section -->
	<section id="roadmap" class="roadmap">
		<div class="section-container">
			<div class="section-header">
				<span class="section-badge accent">Roadmap</span>
				<h2 class="section-title">What's Coming Next</h2>
				<p class="section-subtitle">
					We're actively building new features based on leader feedback
				</p>
			</div>

			<div class="roadmap-grid">
				{#each roadmap as item}
					<div class="roadmap-card">
						<div class="roadmap-status">{item.status}</div>
						<div class="roadmap-icon">
							{#if item.icon === 'book'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
									<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
								</svg>
							{:else if item.icon === 'signup'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
								</svg>
							{:else if item.icon === 'bell'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
									<path d="M13.73 21a2 2 0 0 1-3.46 0"/>
								</svg>
							{:else if item.icon === 'mobile'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
									<line x1="12" y1="18" x2="12.01" y2="18"/>
								</svg>
							{/if}
						</div>
						<h3 class="roadmap-title">{item.title}</h3>
						<p class="roadmap-description">{item.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta">
		<div class="cta-container">
			<div class="cta-content">
				<h2 class="cta-title">Ready to streamline your unit?</h2>
				<p class="cta-subtitle">Free to use. No credit card required. Get started in minutes.</p>
				<div class="cta-actions">
					{#if data.user}
						<a href="/dashboard?show=all" class="btn btn-white btn-lg">
							Go to Dashboard
							<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
								<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</a>
					{:else}
						<a href="/auth/login" class="btn btn-white btn-lg">
							Get Started Free
							<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
								<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
							</svg>
						</a>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<div class="footer-container">
			<div class="footer-brand">
				<div class="nav-logo small">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
						<line x1="16" y1="2" x2="16" y2="6"/>
						<line x1="8" y1="2" x2="8" y2="6"/>
						<line x1="3" y1="10" x2="21" y2="10"/>
					</svg>
				</div>
				<span>Troop to Task</span>
			</div>
			<div class="footer-links">
				<a href="/help">Help</a>
				<a href="#features">Features</a>
				<a href="#roadmap">Roadmap</a>
			</div>
			<p class="footer-text">Built for Army Units</p>
		</div>
	</footer>
</div>

<style>
	/* ============================================
	   Landing Page - Modern Material Design
	   ============================================ */

	.landing {
		min-height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-family);
		overflow-x: hidden;
	}

	/* Navigation */
	.nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		background: rgba(250, 250, 250, 0.8);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-bottom: 1px solid var(--color-divider);
	}

	:global([data-theme='dark']) .nav {
		background: rgba(18, 18, 18, 0.8);
	}

	.nav-container {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0.875rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 600;
		font-size: 1.25rem;
		color: var(--color-text);
		text-decoration: none;
	}

	.nav-logo {
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: var(--shadow-1);
	}

	.nav-logo.small {
		width: 32px;
		height: 32px;
	}

	.nav-logo svg {
		width: 20px;
		height: 20px;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.nav-link {
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.9375rem;
		font-weight: 500;
		transition: color var(--transition-fast);
	}

	.nav-link:hover {
		color: var(--color-text);
	}

	.mobile-actions {
		display: none;
		align-items: center;
		gap: 0.75rem;
	}

	.theme-toggle {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-full);
		border: none;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-1);
	}

	.theme-toggle:hover {
		color: var(--color-text);
		box-shadow: var(--shadow-2);
		transform: scale(1.05);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}

	.theme-toggle.mobile {
		width: 40px;
		height: 40px;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border-radius: var(--radius-lg);
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		transition: all var(--transition-fast);
		border: none;
		cursor: pointer;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
		color: white;
		box-shadow: var(--shadow-1);
	}

	.btn-primary:hover {
		box-shadow: var(--shadow-2);
		transform: translateY(-2px);
	}

	.btn-glass {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
		color: var(--color-text);
		border: 1px solid var(--color-divider);
	}

	.btn-glass:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: var(--color-border);
	}

	.btn-white {
		background: white;
		color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.btn-white:hover {
		box-shadow: var(--shadow-3);
		transform: translateY(-2px);
	}

	.btn-lg {
		padding: 1rem 2rem;
		font-size: 1rem;
		border-radius: var(--radius-xl);
	}

	.btn-sm {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
	}

	.btn-icon {
		width: 18px;
		height: 18px;
	}

	/* Hero */
	.hero {
		position: relative;
		min-height: 100vh;
		display: flex;
		align-items: center;
		padding: 6rem 1.5rem 4rem;
	}

	.hero-bg {
		position: absolute;
		inset: 0;
		overflow: hidden;
		z-index: 0;
	}

	.hero-gradient {
		position: absolute;
		top: -50%;
		right: -20%;
		width: 80%;
		height: 100%;
		background: radial-gradient(ellipse at center, rgba(var(--color-primary-rgb), 0.08) 0%, transparent 70%);
		pointer-events: none;
	}

	.hero-grid {
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(var(--color-divider) 1px, transparent 1px),
			linear-gradient(90deg, var(--color-divider) 1px, transparent 1px);
		background-size: 60px 60px;
		opacity: 0.4;
		mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
		-webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
	}

	.hero-container {
		position: relative;
		z-index: 1;
		max-width: 1280px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		align-items: center;
	}

	.hero-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: 1.5rem;
		box-shadow: var(--shadow-1);
	}

	.badge-dot {
		width: 8px;
		height: 8px;
		background: var(--color-success);
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(0.9); }
	}

	@keyframes float {
		0%, 100% { transform: translateY(0px); }
		50% { transform: translateY(-8px); }
	}

	.hero-title {
		font-size: 3.5rem;
		font-weight: 700;
		line-height: 1.1;
		margin-bottom: 1.5rem;
		letter-spacing: -0.02em;
	}

	.hero-highlight {
		display: block;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-subtitle {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		line-height: 1.7;
		margin-bottom: 2rem;
		max-width: 520px;
	}

	.hero-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 3rem;
	}

	.hero-stats {
		display: flex;
		gap: 3rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-primary);
	}

	.stat-label {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}

	/* Bento Grid */
	.hero-visual {
		display: flex;
		justify-content: center;
	}

	.bento-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		max-width: 420px;
	}

	.bento-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1.25rem;
		box-shadow: var(--shadow-2);
		transition: box-shadow var(--transition-normal);
		animation: float 4s ease-in-out infinite;
	}

	.bento-card:hover {
		box-shadow: var(--shadow-3);
		animation-play-state: paused;
	}

	.bento-calendar {
		grid-column: span 2;
		animation-delay: 0s;
	}

	.bento-training {
		animation-delay: -1s;
	}

	.bento-roster {
		animation-delay: -2s;
	}

	.bento-stats {
		animation-delay: -3s;
	}

	.bento-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.bento-title {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-text);
	}

	.bento-badge {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.25rem 0.5rem;
		background: rgba(76, 175, 80, 0.12);
		color: var(--color-success);
		border-radius: var(--radius-full);
	}

	.mini-calendar {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.cal-row {
		display: flex;
		gap: 4px;
	}

	.cal-row span {
		flex: 1;
		height: 24px;
		border-radius: var(--radius-sm);
		background: var(--color-surface-variant);
	}

	.cal-row.cal-header span {
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.625rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.cal-row span.status.leave { background: #4caf50; }
	.cal-row span.status.tdy { background: #7c4dff; }
	.cal-row span.status.school { background: #2196f3; }
	.cal-row span.status.appt { background: #ff9800; }

	.training-bars {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.training-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.training-name {
		font-size: 0.6875rem;
		color: var(--color-text-muted);
	}

	.training-bar {
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: 3px;
		overflow: hidden;
	}

	.training-fill {
		height: 100%;
		border-radius: 3px;
	}

	.training-fill.green { background: #4caf50; }
	.training-fill.yellow { background: #ff9800; }
	.training-fill.red { background: #f44336; }

	.roster-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.roster-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.roster-role {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		background: var(--color-primary);
		color: white;
		border-radius: var(--radius-sm);
	}

	.roster-name {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.bento-stats {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.coverage-ring {
		position: relative;
		width: 80px;
		height: 80px;
	}

	.coverage-ring svg {
		transform: rotate(-90deg);
		width: 100%;
		height: 100%;
	}

	.ring-bg {
		fill: none;
		stroke: var(--color-surface-variant);
		stroke-width: 3;
	}

	.ring-fill {
		fill: none;
		stroke: var(--color-success);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.coverage-value {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	/* Sections */
	.section-container {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.section-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.section-badge {
		display: inline-block;
		padding: 0.375rem 1rem;
		background: rgba(var(--color-primary-rgb), 0.1);
		color: var(--color-primary);
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1rem;
	}

	.section-badge.accent {
		background: rgba(255, 152, 0, 0.12);
		color: #e65100;
	}

	.section-title {
		font-size: 2.5rem;
		font-weight: 700;
		margin-bottom: 1rem;
		letter-spacing: -0.02em;
	}

	.section-subtitle {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		max-width: 600px;
		margin: 0 auto;
	}

	/* Features */
	.features {
		padding: 6rem 0;
		background: var(--color-bg);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}

	.feature-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1.75rem;
		transition: all var(--transition-normal);
	}

	.feature-card:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
		transform: translateY(-4px);
	}

	.feature-card.highlight {
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
		border-color: transparent;
		color: white;
	}

	.feature-card.highlight .feature-icon {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.feature-card.highlight .feature-description {
		color: rgba(255, 255, 255, 0.85);
	}

	.feature-icon {
		width: 48px;
		height: 48px;
		background: rgba(var(--color-primary-rgb), 0.1);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.25rem;
		color: var(--color-primary);
	}

	.feature-icon svg {
		width: 24px;
		height: 24px;
	}

	.feature-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.feature-description {
		color: var(--color-text-secondary);
		line-height: 1.6;
		font-size: 0.9375rem;
		margin: 0;
	}

	/* How It Works */
	.how-it-works {
		padding: 6rem 0;
		background: var(--color-surface-variant);
	}

	.steps-container {
		position: relative;
		max-width: 800px;
		margin: 0 auto;
	}

	.steps-line {
		position: absolute;
		top: 40px;
		left: 50%;
		transform: translateX(-50%);
		width: 60%;
		height: 2px;
		background: var(--color-border);
	}

	.steps-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
		position: relative;
	}

	.step {
		text-align: center;
	}

	.step-number {
		width: 56px;
		height: 56px;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
		color: white;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 auto 1.5rem;
		box-shadow: var(--shadow-2);
		position: relative;
		z-index: 1;
	}

	.step-content h3 {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.step-content p {
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
		font-size: 0.9375rem;
	}

	/* Roadmap */
	.roadmap {
		padding: 6rem 0;
		background: var(--color-bg);
	}

	.roadmap-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
	}

	.roadmap-card {
		background: var(--color-surface);
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-xl);
		padding: 1.75rem;
		text-align: center;
		transition: all var(--transition-normal);
	}

	.roadmap-card:hover {
		border-style: solid;
		border-color: var(--color-warning);
		transform: translateY(-4px);
	}

	.roadmap-status {
		display: inline-block;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.75rem;
		background: rgba(255, 152, 0, 0.12);
		color: #e65100;
		border-radius: var(--radius-full);
		margin-bottom: 1rem;
	}

	.roadmap-icon {
		width: 56px;
		height: 56px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.25rem;
		color: var(--color-warning);
	}

	.roadmap-icon svg {
		width: 28px;
		height: 28px;
	}

	.roadmap-title {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.roadmap-description {
		color: var(--color-text-secondary);
		line-height: 1.6;
		font-size: 0.875rem;
		margin: 0;
	}

	/* CTA */
	.cta {
		padding: 6rem 0;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
	}

	.cta-container {
		max-width: 800px;
		margin: 0 auto;
		padding: 0 1.5rem;
		text-align: center;
	}

	.cta-title {
		font-size: 2.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.75rem;
		letter-spacing: -0.02em;
	}

	.cta-subtitle {
		font-size: 1.125rem;
		color: rgba(255, 255, 255, 0.85);
		margin-bottom: 2rem;
	}

	/* Footer */
	.footer {
		padding: 2rem 0;
		background: var(--color-bg);
		border-top: 1px solid var(--color-divider);
	}

	.footer-container {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.footer-links {
		display: flex;
		gap: 2rem;
	}

	.footer-links a {
		color: var(--color-text-secondary);
		text-decoration: none;
		font-size: 0.875rem;
		transition: color var(--transition-fast);
	}

	.footer-links a:hover {
		color: var(--color-primary);
	}

	.footer-text {
		color: var(--color-text-muted);
		font-size: 0.875rem;
		margin: 0;
	}

	/* Responsive - Tablet */
	@media (max-width: 1024px) {
		.hero {
			min-height: auto;
			padding: 5rem 1.5rem 3rem;
		}

		.hero-container {
			grid-template-columns: 1fr;
			text-align: center;
			gap: 2.5rem;
		}

		.hero-subtitle {
			margin: 0 auto 2rem;
		}

		.hero-actions {
			justify-content: center;
		}

		.hero-stats {
			justify-content: center;
		}

		/* Content first, then bento grid */
		.hero-visual {
			order: 1;
		}

		.hero-content {
			order: 0;
		}

		.bento-grid {
			max-width: 380px;
		}

		.features-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.roadmap-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.steps-line {
			display: none;
		}

		.steps-grid {
			grid-template-columns: 1fr;
			max-width: 400px;
			margin: 0 auto;
		}

		.section-header {
			margin-bottom: 3rem;
		}

		.features,
		.how-it-works,
		.roadmap,
		.cta {
			padding: 5rem 0;
		}
	}

	@media (max-width: 640px) {
		.nav-links {
			display: none;
		}

		.mobile-actions {
			display: flex;
		}

		.hero {
			padding: 5rem 1rem 2rem;
			min-height: auto;
		}

		.hero-container {
			gap: 2rem;
		}

		/* Show content BEFORE bento grid on mobile */
		.hero-visual {
			order: 0;
		}

		.hero-content {
			order: -1;
		}

		.hero-badge {
			margin-bottom: 1rem;
		}

		.hero-title {
			font-size: 2rem;
			margin-bottom: 1rem;
		}

		.hero-subtitle {
			font-size: 1rem;
			margin-bottom: 1.5rem;
		}

		.hero-actions {
			margin-bottom: 1.5rem;
		}

		.hero-stats {
			flex-direction: row;
			gap: 1.5rem;
			justify-content: center;
		}

		.stat-value {
			font-size: 1.25rem;
		}

		.stat-label {
			font-size: 0.75rem;
		}

		/* Compact 2x2 bento grid on mobile */
		.bento-grid {
			grid-template-columns: 1fr 1fr;
			max-width: 320px;
			gap: 0.75rem;
		}

		.bento-calendar {
			grid-column: span 2;
		}

		.bento-card {
			padding: 0.875rem;
		}

		.bento-header {
			margin-bottom: 0.5rem;
		}

		.bento-title {
			font-size: 0.75rem;
		}

		.bento-badge {
			font-size: 0.5rem;
			padding: 0.125rem 0.375rem;
		}

		/* Smaller calendar rows */
		.cal-row span {
			height: 18px;
		}

		.cal-row.cal-header span {
			font-size: 0.5rem;
		}

		/* Smaller training bars */
		.training-name {
			font-size: 0.5625rem;
		}

		.training-item {
			gap: 2px;
		}

		.training-bars {
			gap: 0.5rem;
		}

		/* Smaller roster */
		.roster-role {
			font-size: 0.5rem;
			padding: 0.125rem 0.375rem;
		}

		.roster-name {
			font-size: 0.625rem;
		}

		.roster-list {
			gap: 0.375rem;
		}

		/* Smaller coverage ring */
		.coverage-ring {
			width: 60px;
			height: 60px;
		}

		.coverage-value {
			font-size: 0.875rem;
		}

		/* Features section */
		.features {
			padding: 4rem 0;
		}

		.section-header {
			margin-bottom: 2.5rem;
		}

		.section-badge {
			font-size: 0.6875rem;
		}

		.section-title {
			font-size: 1.75rem;
		}

		.section-subtitle {
			font-size: 1rem;
		}

		.features-grid {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.feature-card {
			padding: 1.25rem;
		}

		.feature-icon {
			width: 40px;
			height: 40px;
			margin-bottom: 1rem;
		}

		.feature-icon svg {
			width: 20px;
			height: 20px;
		}

		.feature-title {
			font-size: 1rem;
		}

		.feature-description {
			font-size: 0.875rem;
		}

		/* How it works */
		.how-it-works {
			padding: 4rem 0;
		}

		.step-number {
			width: 48px;
			height: 48px;
			font-size: 1.125rem;
			margin-bottom: 1rem;
		}

		.step-content h3 {
			font-size: 1rem;
		}

		.step-content p {
			font-size: 0.875rem;
		}

		/* Roadmap */
		.roadmap {
			padding: 4rem 0;
		}

		.roadmap-grid {
			grid-template-columns: 1fr 1fr;
			gap: 1rem;
		}

		.roadmap-card {
			padding: 1.25rem;
		}

		.roadmap-icon {
			width: 44px;
			height: 44px;
			margin-bottom: 1rem;
		}

		.roadmap-icon svg {
			width: 22px;
			height: 22px;
		}

		.roadmap-title {
			font-size: 1rem;
		}

		.roadmap-description {
			font-size: 0.8125rem;
		}

		/* CTA */
		.cta {
			padding: 4rem 0;
		}

		.cta-title {
			font-size: 1.5rem;
		}

		.cta-subtitle {
			font-size: 1rem;
		}

		/* Footer */
		.footer-container {
			flex-direction: column;
			gap: 1.25rem;
			text-align: center;
		}

		.footer-links {
			gap: 1.25rem;
		}
	}

	/* Respect reduced motion preferences */
	@media (prefers-reduced-motion: reduce) {
		.bento-card {
			animation: none;
		}

		.badge-dot {
			animation: none;
		}
	}
</style>
