<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data } = $props();

	const features = [
		{
			icon: 'calendar',
			title: 'Visual Calendar',
			description: 'See your entire unit\'s availability at a glance. Color-coded statuses for leave, TDY, training, appointments, and more.'
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
			icon: 'chart',
			title: '3-Month View',
			description: 'Long-range planning made easy. See coverage gaps before they become problems.'
		},
		{
			icon: 'certificate',
			title: 'Training Tracker',
			description: 'Track certifications and requirements. Color-coded warnings at 60, 30, and 0 days before expiration.'
		},
		{
			icon: 'shield',
			title: 'Team Permissions',
			description: 'Granular access control. Set view/edit permissions for calendar, personnel, and training per member.'
		},
		{
			icon: 'building',
			title: 'Multi-Organization Support',
			description: 'Manage multiple organizations from one account. Invite team members and control access levels.'
		},
		{
			icon: 'download',
			title: 'Export & Print',
			description: 'Export calendars to Excel with color-coding intact. Print-ready PDF for posting on the board.'
		}
	];

	const comingSoon = [
		{
			icon: 'roster',
			title: 'Duty Roster Generator',
			description: 'Auto-generate fair duty rosters based on availability and past assignments.'
		},
		{
			icon: 'book',
			title: 'Digital Leaders Book',
			description: 'Centralized soldier information, counseling records, and leader tools.'
		},
		{
			icon: 'signup',
			title: 'Event Sign-ups',
			description: 'Coordinate range days, ACFT, and unit events with built-in sign-up sheets.'
		}
	];
</script>

<svelte:head>
	<title>Troop to Task - Army Unit Personnel Management</title>
	<meta name="description" content="The complete personnel management solution for Army units. Visual calendars, training tracking, duty assignments, and team coordination in one tool." />
</svelte:head>

<div class="landing" data-theme={themeStore.current}>
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
				<a href="#coming-soon" class="nav-link">Roadmap</a>
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
					<a href="/auth/logout" class="btn btn-secondary" data-sveltekit-reload>Sign Out</a>
				{:else}
					<a href="/auth/login" class="nav-link">Sign In</a>
					<a href="/auth/login" class="btn btn-primary">Get Started</a>
				{/if}
			</div>

			<!-- Mobile menu button -->
			<button class="mobile-menu-btn" aria-label="Menu">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			</button>
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="hero">
		<div class="hero-content">
			<div class="hero-badge">Built for Army Units</div>
			<h1 class="hero-title">
				Personnel Management<br />
				<span class="hero-highlight">That Actually Works</span>
			</h1>
			<p class="hero-subtitle">
				Stop juggling spreadsheets, whiteboards, and group texts. Troop to Task gives you
				a visual calendar, training tracker, and assignment planner — all in one place
				your whole team can access.
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
				<a href="#features" class="btn btn-secondary btn-lg">See Features</a>
			</div>
		</div>

		<!-- Hero Visual -->
		<div class="hero-visual">
			<div class="hero-mockup">
				<div class="mockup-header">
					<div class="mockup-dots">
						<span></span><span></span><span></span>
					</div>
					<div class="mockup-title">February 2026</div>
					<div class="mockup-nav">
						<span class="mockup-nav-item active">Calendar</span>
						<span class="mockup-nav-item">Personnel</span>
						<span class="mockup-nav-item">Training</span>
					</div>
				</div>
				<div class="mockup-calendar">
					<div class="mockup-row mockup-header-row">
						<div class="mockup-cell name">Personnel</div>
						{#each ['M', 'T', 'W', 'T', 'F'] as day}
							<div class="mockup-cell day">{day}</div>
						{/each}
					</div>
					<div class="mockup-group-header">Alpha Company</div>
					<div class="mockup-row">
						<div class="mockup-cell name">CPT Rodriguez</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell"></div>
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">1SG Martinez</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">SSG Thompson</div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
					</div>
					<div class="mockup-group-header">Bravo Company</div>
					<div class="mockup-row">
						<div class="mockup-cell name">SGT Williams</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status appt"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">SPC Davis</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status school"></div>
						<div class="mockup-cell status school"></div>
						<div class="mockup-cell status school"></div>
						<div class="mockup-cell status school"></div>
					</div>
				</div>
				<div class="mockup-legend">
					<span class="legend-item"><span class="legend-dot leave"></span>Leave</span>
					<span class="legend-item"><span class="legend-dot tdy"></span>TDY</span>
					<span class="legend-item"><span class="legend-dot school"></span>School</span>
					<span class="legend-item"><span class="legend-dot appt"></span>Appt</span>
				</div>
			</div>
		</div>
	</section>

	<!-- Social Proof -->
	<section class="social-proof">
		<div class="section-container">
			<p class="proof-text">Designed by Army leaders, for Army leaders</p>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="features">
		<div class="section-container">
			<div class="section-header">
				<h2 class="section-title">Everything You Need</h2>
				<p class="section-subtitle">
					Purpose-built tools for military unit personnel management
				</p>
			</div>

			<div class="features-grid">
				{#each features as feature}
					<div class="feature-card">
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
									<line x1="8" y1="14" x2="8" y2="14"/>
									<line x1="12" y1="14" x2="12" y2="14"/>
									<line x1="16" y1="14" x2="16" y2="14"/>
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
				<h2 class="section-title">How It Works</h2>
				<p class="section-subtitle">Get your unit up and running in minutes</p>
			</div>

			<div class="steps-grid">
				<div class="step">
					<div class="step-number">1</div>
					<h3>Create Your Organization</h3>
					<p>Sign up and create your unit's workspace. Invite team members with customizable permission levels.</p>
				</div>
				<div class="step">
					<div class="step-number">2</div>
					<h3>Add Your Personnel</h3>
					<p>Enter your roster manually or bulk import from a spreadsheet. Organize into groups and sections.</p>
				</div>
				<div class="step">
					<div class="step-number">3</div>
					<h3>Track Everything</h3>
					<p>Log availability, assign duties, and monitor training. Your whole team sees updates in real-time.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Coming Soon Section -->
	<section id="coming-soon" class="coming-soon">
		<div class="section-container">
			<div class="section-header">
				<div class="coming-soon-badge">Roadmap</div>
				<h2 class="section-title">Coming Soon</h2>
				<p class="section-subtitle">
					We're actively building new features based on leader feedback
				</p>
			</div>

			<div class="coming-soon-grid">
				{#each comingSoon as item}
					<div class="coming-soon-card">
						<div class="coming-soon-icon">
							{#if item.icon === 'roster'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
									<polyline points="14 2 14 8 20 8"/>
									<line x1="16" y1="13" x2="8" y2="13"/>
									<line x1="16" y1="17" x2="8" y2="17"/>
									<polyline points="10 9 9 9 8 9"/>
								</svg>
							{:else if item.icon === 'book'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
									<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
									<line x1="8" y1="7" x2="16" y2="7"/>
									<line x1="8" y1="11" x2="14" y2="11"/>
								</svg>
							{:else if item.icon === 'signup'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
									<line x1="16" y1="2" x2="16" y2="6"/>
									<line x1="8" y1="2" x2="8" y2="6"/>
									<line x1="3" y1="10" x2="21" y2="10"/>
									<path d="M8 14h.01"/>
									<path d="M12 14h.01"/>
									<path d="M16 14h.01"/>
									<path d="M8 18h.01"/>
									<path d="M12 18h.01"/>
								</svg>
							{/if}
						</div>
						<h3 class="coming-soon-title">{item.title}</h3>
						<p class="coming-soon-description">{item.description}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta">
		<div class="section-container">
			<h2 class="cta-title">Ready to streamline your unit management?</h2>
			<p class="cta-subtitle">Free to use. No credit card required.</p>
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
			<p class="footer-text">Built for Army Units</p>
		</div>
	</footer>
</div>

<style>
	/* Theme Variables */
	.landing {
		--bg: #ffffff;
		--bg-alt: #f8fafc;
		--surface: #ffffff;
		--surface-raised: #ffffff;
		--text: #0f172a;
		--text-muted: #64748b;
		--border: #e2e8f0;
		--primary: #1a365d;
		--primary-light: #2c5282;
		--accent: #c6a03b;
		--success: #22c55e;
		--shadow: rgba(0, 0, 0, 0.1);
	}

	.landing[data-theme='dark'] {
		--bg: #0f172a;
		--bg-alt: #1e293b;
		--surface: #0f172a;
		--surface-raised: #1e293b;
		--text: #f1f5f9;
		--text-muted: #94a3b8;
		--border: #334155;
		--primary: #3b82f6;
		--primary-light: #60a5fa;
		--accent: #fbbf24;
		--shadow: rgba(0, 0, 0, 0.3);
	}

	.landing {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	/* Navigation */
	.nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		backdrop-filter: blur(8px);
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 700;
		font-size: 1.25rem;
		color: var(--text);
		text-decoration: none;
	}

	.nav-logo {
		width: 36px;
		height: 36px;
		background: var(--primary);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.nav-logo.small {
		width: 28px;
		height: 28px;
	}

	.nav-logo svg {
		width: 20px;
		height: 20px;
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.nav-link {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9375rem;
		font-weight: 500;
		transition: color 0.15s;
	}

	.nav-link:hover {
		color: var(--text);
	}

	.mobile-menu-btn {
		display: none;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		align-items: center;
		justify-content: center;
	}

	.mobile-menu-btn svg {
		width: 20px;
		height: 20px;
	}

	.theme-toggle {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
	}

	.theme-toggle:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		text-decoration: none;
		transition: all 0.15s;
		border: none;
		cursor: pointer;
	}

	.btn-primary {
		background: var(--primary);
		color: white;
	}

	.btn-primary:hover {
		background: var(--primary-light);
	}

	.btn-secondary {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.btn-secondary:hover {
		border-color: var(--text-muted);
	}

	.btn-lg {
		padding: 0.875rem 1.75rem;
		font-size: 1rem;
	}

	.btn-icon {
		width: 18px;
		height: 18px;
	}

	/* Hero */
	.hero {
		padding: 8rem 1.5rem 4rem;
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 1.1fr;
		gap: 4rem;
		align-items: center;
	}

	.hero-badge {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		background: var(--bg-alt);
		border: 1px solid var(--border);
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 1.5rem;
	}

	.hero-title {
		font-size: 3.25rem;
		font-weight: 800;
		line-height: 1.1;
		margin-bottom: 1.5rem;
	}

	.hero-highlight {
		background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.hero-subtitle {
		font-size: 1.125rem;
		color: var(--text-muted);
		line-height: 1.7;
		margin-bottom: 2rem;
		max-width: 540px;
	}

	.hero-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	/* Hero Mockup */
	.hero-visual {
		display: flex;
		justify-content: center;
	}

	.hero-mockup {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: 0 20px 40px var(--shadow);
		overflow: hidden;
		width: 100%;
		max-width: 520px;
	}

	.mockup-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--primary);
		color: white;
	}

	.mockup-dots {
		display: flex;
		gap: 6px;
	}

	.mockup-dots span {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: rgba(255,255,255,0.3);
	}

	.mockup-title {
		font-weight: 600;
		font-size: 0.875rem;
		flex: 1;
	}

	.mockup-nav {
		display: flex;
		gap: 0.75rem;
		font-size: 0.75rem;
	}

	.mockup-nav-item {
		opacity: 0.7;
	}

	.mockup-nav-item.active {
		opacity: 1;
		font-weight: 600;
	}

	.mockup-calendar {
		padding: 0.75rem;
	}

	.mockup-group-header {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--primary);
		padding: 0.5rem 0.25rem 0.25rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.mockup-row {
		display: flex;
		gap: 2px;
	}

	.mockup-row.mockup-header-row {
		margin-bottom: 2px;
	}

	.mockup-cell {
		flex: 1;
		height: 28px;
		border-radius: 3px;
		background: var(--bg-alt);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		margin: 1px;
	}

	.mockup-cell.name {
		flex: 2.5;
		justify-content: flex-start;
		padding-left: 6px;
		font-weight: 500;
		background: transparent;
		font-size: 0.65rem;
	}

	.mockup-cell.day {
		font-weight: 600;
		color: var(--text-muted);
		background: transparent;
	}

	.mockup-cell.status.leave { background: #22c55e; }
	.mockup-cell.status.tdy { background: #8b5cf6; }
	.mockup-cell.status.school { background: #3b82f6; }
	.mockup-cell.status.appt { background: #f59e0b; }

	.mockup-legend {
		display: flex;
		gap: 1rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--border);
		font-size: 0.65rem;
		color: var(--text-muted);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.legend-dot.leave { background: #22c55e; }
	.legend-dot.tdy { background: #8b5cf6; }
	.legend-dot.school { background: #3b82f6; }
	.legend-dot.appt { background: #f59e0b; }

	/* Social Proof */
	.social-proof {
		padding: 2rem 0;
		background: var(--bg-alt);
		border-top: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
	}

	.proof-text {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9375rem;
		font-weight: 500;
		margin: 0;
	}

	/* Sections */
	.section-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.section-header {
		text-align: center;
		margin-bottom: 4rem;
	}

	.section-title {
		font-size: 2.5rem;
		font-weight: 800;
		margin-bottom: 1rem;
	}

	.section-subtitle {
		font-size: 1.125rem;
		color: var(--text-muted);
		max-width: 600px;
		margin: 0 auto;
	}

	/* Features */
	.features {
		padding: 6rem 0;
		background: var(--bg);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.5rem;
	}

	.feature-card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem;
		transition: all 0.2s;
	}

	.feature-card:hover {
		border-color: var(--primary);
		box-shadow: 0 8px 24px var(--shadow);
	}

	.feature-icon {
		width: 44px;
		height: 44px;
		background: var(--bg-alt);
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		color: var(--primary);
	}

	.feature-icon svg {
		width: 22px;
		height: 22px;
	}

	.feature-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
	}

	.feature-description {
		color: var(--text-muted);
		line-height: 1.5;
		font-size: 0.875rem;
		margin: 0;
	}

	/* How It Works */
	.how-it-works {
		padding: 6rem 0;
		background: var(--bg-alt);
	}

	.steps-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
	}

	.step {
		text-align: center;
		padding: 2rem;
	}

	.step-number {
		width: 48px;
		height: 48px;
		background: var(--primary);
		color: white;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 auto 1.25rem;
	}

	.step h3 {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.step p {
		color: var(--text-muted);
		line-height: 1.6;
		margin: 0;
		font-size: 0.9375rem;
	}

	/* Coming Soon */
	.coming-soon {
		padding: 6rem 0;
		background: var(--bg);
	}

	.coming-soon-badge {
		display: inline-block;
		padding: 0.375rem 0.875rem;
		background: var(--accent);
		color: #000;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 1rem;
	}

	.coming-soon-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
	}

	.coming-soon-card {
		background: var(--surface-raised);
		border: 2px dashed var(--border);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
	}

	.coming-soon-icon {
		width: 56px;
		height: 56px;
		background: var(--bg-alt);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.25rem;
		color: var(--accent);
	}

	.coming-soon-icon svg {
		width: 28px;
		height: 28px;
	}

	.coming-soon-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.coming-soon-description {
		color: var(--text-muted);
		line-height: 1.6;
		font-size: 0.9375rem;
		margin: 0;
	}

	/* CTA */
	.cta {
		padding: 6rem 0;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
		text-align: center;
	}

	.cta-title {
		font-size: 2.25rem;
		font-weight: 800;
		color: white;
		margin-bottom: 0.75rem;
	}

	.cta-subtitle {
		font-size: 1.125rem;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 2rem;
	}

	.cta .btn-primary {
		background: white;
		color: var(--primary);
	}

	.cta .btn-primary:hover {
		background: rgba(255, 255, 255, 0.9);
	}

	/* Footer */
	.footer {
		padding: 2rem 0;
		background: var(--bg);
		border-top: 1px solid var(--border);
	}

	.footer-container {
		max-width: 1200px;
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

	.footer-text {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 1024px) {
		.hero {
			grid-template-columns: 1fr;
			text-align: center;
			padding-top: 7rem;
			gap: 3rem;
		}

		.hero-subtitle {
			margin: 0 auto 2rem;
		}

		.hero-actions {
			justify-content: center;
		}

		.hero-visual {
			order: -1;
		}

		.hero-mockup {
			max-width: 400px;
		}

		.features-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.steps-grid {
			grid-template-columns: 1fr;
			max-width: 400px;
			margin: 0 auto;
		}

		.coming-soon-grid {
			grid-template-columns: 1fr;
			max-width: 400px;
			margin: 0 auto;
		}
	}

	@media (max-width: 640px) {
		.nav-links {
			display: none;
		}

		.mobile-menu-btn {
			display: flex;
		}

		.hero-title {
			font-size: 2.25rem;
		}

		.hero-mockup {
			max-width: 100%;
		}

		.mockup-nav {
			display: none;
		}

		.features-grid {
			grid-template-columns: 1fr;
		}

		.section-title {
			font-size: 2rem;
		}

		.footer-container {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}
	}
</style>
