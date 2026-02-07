<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';

	let { data } = $props();

	const features = [
		{
			icon: 'calendar',
			title: 'Calendar View',
			description: 'Visual monthly calendar showing all personnel availability at a glance. Color-coded statuses make it easy to see who is available.'
		},
		{
			icon: 'users',
			title: 'Personnel Management',
			description: 'Organize your team by groups and sections. Track rank, MOS, and clinic roles for everyone in your unit.'
		},
		{
			icon: 'clipboard',
			title: 'Daily Assignments',
			description: 'Assign MOD, front desk support, and other daily duties. Plan assignments for the entire month in advance.'
		},
		{
			icon: 'chart',
			title: 'Long-Range Planning',
			description: 'View three months at a time to plan around leave, TDY, and training. Never be caught off guard by coverage gaps.'
		},
		{
			icon: 'certificate',
			title: 'Training Tracker',
			description: 'Track certifications and training requirements. Get warnings before credentials expire with color-coded alerts.'
		},
		{
			icon: 'bolt',
			title: 'Bulk Operations',
			description: 'Apply status to multiple personnel at once. Perfect for unit-wide training, block leave, or field exercises.'
		}
	];
</script>

<svelte:head>
	<title>Troop to Task - Army Clinic Staff Scheduling</title>
	<meta name="description" content="Simplify personnel tracking for Army medical units. Visual availability calendar, assignment planning, and training management in one tool." />
</svelte:head>

<div class="landing" data-theme={themeStore.current}>
	<!-- Navigation -->
	<nav class="nav">
		<div class="nav-container">
			<a href="/" class="nav-brand">
				<div class="nav-logo">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
					</svg>
				</div>
				<span>Troop to Task</span>
			</a>

			<div class="nav-links">
				<a href="#features" class="nav-link">Features</a>
				<a href="#benefits" class="nav-link">Benefits</a>
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
					<a href="/dashboard" class="btn btn-primary">Dashboard</a>
				{:else}
					<a href="/auth/login" class="nav-link">Sign In</a>
					<a href="/auth/login" class="btn btn-primary">Try Demo</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="hero">
		<div class="hero-container">
			<div class="hero-badge">Built for Army Medical Units</div>
			<h1 class="hero-title">
				Personnel Tracking<br />
				<span class="hero-highlight">Made Simple</span>
			</h1>
			<p class="hero-subtitle">
				Stop juggling spreadsheets and whiteboards. Troop to Task gives you a visual calendar
				to track availability, plan assignments, and manage training — all in one place.
			</p>
			<div class="hero-actions">
				<a href="/auth/login" class="btn btn-primary btn-lg">
					Try Demo
					<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
						<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
					</svg>
				</a>
				<a href="#features" class="btn btn-secondary btn-lg">Learn More</a>
			</div>
			<p class="hero-note">No account needed to explore the demo</p>
		</div>

		<!-- Hero Visual -->
		<div class="hero-visual">
			<div class="hero-mockup">
				<div class="mockup-header">
					<div class="mockup-dots">
						<span></span><span></span><span></span>
					</div>
					<div class="mockup-title">February 2025</div>
				</div>
				<div class="mockup-calendar">
					<div class="mockup-row mockup-header-row">
						<div class="mockup-cell name">Personnel</div>
						{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as day}
							<div class="mockup-cell day">{day}</div>
						{/each}
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">SGT Smith</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell status leave"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell weekend"></div>
						<div class="mockup-cell weekend"></div>
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">CPT Jones</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell status tdy"></div>
						<div class="mockup-cell weekend"></div>
						<div class="mockup-cell weekend"></div>
					</div>
					<div class="mockup-row">
						<div class="mockup-cell name">SPC Davis</div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell status appt"></div>
						<div class="mockup-cell"></div>
						<div class="mockup-cell weekend"></div>
						<div class="mockup-cell weekend"></div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="features">
		<div class="section-container">
			<div class="section-header">
				<h2 class="section-title">Everything You Need</h2>
				<p class="section-subtitle">
					Purpose-built tools for military medical unit personnel management
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
									<line x1="18" y1="20" x2="18" y2="10"/>
									<line x1="12" y1="20" x2="12" y2="4"/>
									<line x1="6" y1="20" x2="6" y2="14"/>
								</svg>
							{:else if feature.icon === 'certificate'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="8" r="7"/>
									<polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
								</svg>
							{:else if feature.icon === 'bolt'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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

	<!-- Benefits Section -->
	<section id="benefits" class="benefits">
		<div class="section-container">
			<div class="benefits-grid">
				<div class="benefits-content">
					<h2 class="section-title">Why Troop to Task?</h2>
					<ul class="benefits-list">
						<li>
							<div class="benefit-check">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
								</svg>
							</div>
							<div>
								<strong>See availability instantly</strong>
								<p>No more asking around or checking multiple sources. One glance tells you who's available.</p>
							</div>
						</li>
						<li>
							<div class="benefit-check">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
								</svg>
							</div>
							<div>
								<strong>Plan ahead with confidence</strong>
								<p>See three months at once. Know about coverage gaps before they become problems.</p>
							</div>
						</li>
						<li>
							<div class="benefit-check">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
								</svg>
							</div>
							<div>
								<strong>Never miss a training deadline</strong>
								<p>Color-coded warnings show expiring certifications 60, 30, and 0 days out.</p>
							</div>
						</li>
						<li>
							<div class="benefit-check">
								<svg viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
								</svg>
							</div>
							<div>
								<strong>Save hours every week</strong>
								<p>Stop maintaining spreadsheets and whiteboards. Updates happen in real-time.</p>
							</div>
						</li>
					</ul>
				</div>

				<div class="benefits-stats">
					<div class="stat-card">
						<div class="stat-number">100%</div>
						<div class="stat-label">Visibility</div>
						<p class="stat-desc">See your entire unit's status at a glance</p>
					</div>
					<div class="stat-card">
						<div class="stat-number">3</div>
						<div class="stat-label">Month View</div>
						<p class="stat-desc">Plan ahead with long-range calendar</p>
					</div>
					<div class="stat-card">
						<div class="stat-number">0</div>
						<div class="stat-label">Spreadsheets</div>
						<p class="stat-desc">Everything in one integrated tool</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta">
		<div class="section-container">
			<h2 class="cta-title">Ready to simplify your personnel tracking?</h2>
			<p class="cta-subtitle">Try the demo with sample data — no account required</p>
			<a href="/auth/login" class="btn btn-primary btn-lg">
				Try Demo Now
				<svg viewBox="0 0 20 20" fill="currentColor" class="btn-icon">
					<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
				</svg>
			</a>
		</div>
	</section>

	<!-- Footer -->
	<footer class="footer">
		<div class="footer-container">
			<div class="footer-brand">
				<div class="nav-logo">
					<svg viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
					</svg>
				</div>
				<span>Troop to Task</span>
			</div>
			<p class="footer-text">Designed for Army Medical Units</p>
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

	.nav-logo svg {
		width: 22px;
		height: 22px;
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
		grid-template-columns: 1fr 1fr;
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
		font-size: 3.5rem;
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
		font-size: 1.25rem;
		color: var(--text-muted);
		line-height: 1.6;
		margin-bottom: 2rem;
		max-width: 540px;
	}

	.hero-actions {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.hero-note {
		font-size: 0.875rem;
		color: var(--text-muted);
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
		max-width: 480px;
	}

	.mockup-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: var(--bg-alt);
		border-bottom: 1px solid var(--border);
	}

	.mockup-dots {
		display: flex;
		gap: 6px;
	}

	.mockup-dots span {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--border);
	}

	.mockup-dots span:first-child { background: #ef4444; }
	.mockup-dots span:nth-child(2) { background: #fbbf24; }
	.mockup-dots span:last-child { background: #22c55e; }

	.mockup-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.mockup-calendar {
		padding: 1rem;
	}

	.mockup-row {
		display: flex;
		gap: 2px;
	}

	.mockup-row.mockup-header-row {
		margin-bottom: 4px;
	}

	.mockup-cell {
		flex: 1;
		height: 32px;
		border-radius: 4px;
		background: var(--bg-alt);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		margin: 1px;
	}

	.mockup-cell.name {
		flex: 2;
		justify-content: flex-start;
		padding-left: 8px;
		font-weight: 500;
		background: transparent;
	}

	.mockup-cell.day {
		font-weight: 600;
		color: var(--text-muted);
		background: transparent;
	}

	.mockup-cell.status.leave { background: #22c55e; }
	.mockup-cell.status.tdy { background: #3b82f6; }
	.mockup-cell.status.appt { background: #f59e0b; }
	.mockup-cell.weekend { background: var(--border); opacity: 0.5; }

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
		font-size: 1.25rem;
		color: var(--text-muted);
		max-width: 600px;
		margin: 0 auto;
	}

	/* Features */
	.features {
		padding: 6rem 0;
		background: var(--bg-alt);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
	}

	.feature-card {
		background: var(--surface-raised);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 2rem;
		transition: all 0.2s;
	}

	.feature-card:hover {
		border-color: var(--primary);
		box-shadow: 0 8px 24px var(--shadow);
	}

	.feature-icon {
		width: 48px;
		height: 48px;
		background: var(--bg-alt);
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.25rem;
		color: var(--primary);
	}

	.feature-icon svg {
		width: 24px;
		height: 24px;
	}

	.feature-title {
		font-size: 1.125rem;
		font-weight: 700;
		margin-bottom: 0.75rem;
	}

	.feature-description {
		color: var(--text-muted);
		line-height: 1.6;
		font-size: 0.9375rem;
	}

	/* Benefits */
	.benefits {
		padding: 6rem 0;
		background: var(--bg);
	}

	.benefits-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		align-items: start;
	}

	.benefits-content .section-title {
		text-align: left;
		margin-bottom: 2rem;
	}

	.benefits-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.benefits-list li {
		display: flex;
		gap: 1rem;
	}

	.benefit-check {
		width: 28px;
		height: 28px;
		background: var(--success);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.benefit-check svg {
		width: 16px;
		height: 16px;
	}

	.benefits-list strong {
		display: block;
		font-size: 1.0625rem;
		margin-bottom: 0.25rem;
	}

	.benefits-list p {
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0;
	}

	.benefits-stats {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}

	.stat-card {
		background: var(--bg-alt);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.5rem 2rem;
		text-align: center;
	}

	.stat-number {
		font-size: 3rem;
		font-weight: 800;
		color: var(--primary);
		line-height: 1;
	}

	.stat-label {
		font-size: 1rem;
		font-weight: 600;
		margin: 0.5rem 0;
	}

	.stat-desc {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0;
	}

	/* CTA */
	.cta {
		padding: 6rem 0;
		background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
		text-align: center;
	}

	.cta-title {
		font-size: 2.5rem;
		font-weight: 800;
		color: white;
		margin-bottom: 1rem;
	}

	.cta-subtitle {
		font-size: 1.25rem;
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
		gap: 0.75rem;
		font-weight: 600;
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

		.features-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.benefits-grid {
			grid-template-columns: 1fr;
		}

		.benefits-content .section-title {
			text-align: center;
		}

		.benefits-stats {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 640px) {
		.hero-title {
			font-size: 2.5rem;
		}

		.features-grid {
			grid-template-columns: 1fr;
		}

		.benefits-stats {
			grid-template-columns: 1fr;
		}

		.nav-links .nav-link {
			display: none;
		}

		.footer-container {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}
	}
</style>
