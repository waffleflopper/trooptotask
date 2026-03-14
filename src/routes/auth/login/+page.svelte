<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { form, data } = $props();
	let loading = $state(false);
	let demoLoading = $state(false);
</script>

<svelte:head>
	<title>Sign In — Troop to Task</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-noise"></div>
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
		{/if}
	</button>
	<div class="beta-banner">
		<p class="beta-headline">We're looking for beta testers!</p>
		<p class="beta-sub">Help shape the future of Army personnel management.</p>
		<a href="/auth/request-access" class="beta-cta">Request Access</a>
	</div>
	<div class="auth-card">
		<div class="brand">
			<div class="brand-mark">T2T</div>
			<h1>Troop to Task</h1>
			<p class="subtitle">Personnel Management System</p>
		</div>

		<form
			method="POST"
			action="?/login"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<div class="error-message" data-testid="login-error">
					<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
						<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
					{form.error}
				</div>
			{/if}

			<div class="form-group">
				<label class="label" for="email">Email Address</label>
				<input
					id="email"
					name="email"
					type="email"
					class="input"
					data-testid="login-email"
					value={form?.email ?? ''}
					required
					autocomplete="email"
					placeholder="you@example.com"
				/>
			</div>

			<div class="form-group">
				<label class="label" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					class="input"
					data-testid="login-password"
					required
					autocomplete="current-password"
					placeholder="Enter your password"
				/>
			</div>

			<button type="submit" class="btn-sign-in" data-testid="login-submit" disabled={loading}>
				{#if loading}
					<span class="spinner"></span>
					Signing in...
				{:else}
					Sign In
				{/if}
			</button>
		</form>

		<p class="forgot-link">
			<a href="/auth/forgot-password">Forgot password?</a>
		</p>

		<div class="divider">
			<span>or</span>
		</div>

		{#if data.demoError}
			<div class="error-message">
				<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
					<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
				</svg>
				{data.demoError}
			</div>
		{/if}

		<form
			method="POST"
			action="?/demo"
			use:enhance={() => {
				demoLoading = true;
				return async ({ update }) => {
					demoLoading = false;
					await update();
				};
			}}
		>
			<button type="submit" class="btn-demo" disabled={demoLoading || loading}>
				{#if demoLoading}
					<span class="spinner demo-spinner"></span>
					Loading demo...
				{:else}
					<svg viewBox="0 0 20 20" fill="currentColor" class="demo-icon">
						<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
						<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
					</svg>
					Try Demo
				{/if}
			</button>
		</form>

		<p class="demo-hint">Explore with sample data — no account needed</p>

		<div class="divider">
			<span>new here?</span>
		</div>

		<p class="auth-link">
			Have an invite code? <a href="/auth/register">Create an account</a>
		</p>
		<p class="auth-link" style="margin-top: var(--spacing-sm);">
			No invite code? <a href="/auth/request-access">Request access</a>
		</p>
	</div>

	<footer class="auth-footer">
		<p>Built for Army leaders, by Army leaders.</p>
	</footer>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0F0F0F;
		padding: var(--spacing-lg);
		position: relative;
	}

	.auth-noise {
		position: absolute;
		inset: 0;
		opacity: 0.03;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 256px 256px;
		pointer-events: none;
	}

	.auth-card {
		background: var(--color-surface);
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0,0,0,0.4);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 400px;
		position: relative;
	}

	.brand {
		text-align: center;
		margin-bottom: var(--spacing-xl);
	}

	.brand-mark {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.05em;
		background: #B8943E;
		color: #0F0F0F;
		padding: 0.35rem 0.625rem;
		border-radius: 5px;
		display: inline-block;
		margin-bottom: var(--spacing-sm);
		line-height: 1;
	}

	.brand h1 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		color: var(--color-text);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		font-family: var(--font-mono);
		color: var(--color-text-muted);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.error-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.btn-sign-in {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: 0.75rem var(--spacing-md);
		font-family: var(--font-family);
		font-size: var(--font-size-base);
		font-weight: 500;
		background: #B8943E;
		color: #0F0F0F;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		transition: all 0.15s;
	}

	.btn-sign-in:hover:not(:disabled) {
		background: #D4B15A;
	}

	.btn-sign-in:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(15, 15, 15, 0.3);
		border-radius: 50%;
		border-top-color: #0F0F0F;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.divider {
		display: flex;
		align-items: center;
		margin: var(--spacing-lg) 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.divider span {
		padding: 0 var(--spacing-md);
	}

	.auth-link {
		text-align: center;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.auth-link a {
		color: #B8943E;
		font-weight: 500;
		text-decoration: none;
	}

	.auth-link a:hover {
		text-decoration: underline;
	}

	.forgot-link {
		text-align: right;
		margin-top: var(--spacing-sm);
	}

	.forgot-link a {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-decoration: none;
	}

	.forgot-link a:hover {
		color: #B8943E;
		text-decoration: underline;
	}

	.btn-demo {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: 0.75rem var(--spacing-md);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		font-family: var(--font-family);
		font-size: var(--font-size-base);
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-demo:hover:not(:disabled) {
		border-color: var(--color-text-muted);
		color: var(--color-text);
	}

	.btn-demo:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.demo-icon {
		width: 18px;
		height: 18px;
	}

	.demo-spinner {
		border-color: rgba(0, 0, 0, 0.2);
		border-top-color: var(--color-text);
	}

	.demo-hint {
		text-align: center;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-sm);
	}

	.beta-banner {
		text-align: center;
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-lg) var(--spacing-xl);
		background: rgba(184, 148, 62, 0.08);
		border: 1px solid rgba(184, 148, 62, 0.25);
		border-radius: 12px;
		width: 100%;
		max-width: 400px;
		position: relative;
	}

	.beta-headline {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: #B8943E;
		margin-bottom: var(--spacing-xs);
	}

	.beta-sub {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.beta-cta {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: #B8943E;
		color: #0F0F0F;
		font-weight: 600;
		font-size: var(--font-size-sm);
		border-radius: 8px;
		text-decoration: none;
		transition: background 0.15s;
	}

	.beta-cta:hover {
		background: #D4B15A;
	}

	.auth-footer {
		margin-top: var(--spacing-xl);
		text-align: center;
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.75rem;
		position: relative;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid #2A2A2A;
		color: #8A8780;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
		z-index: 1;
	}

	.theme-toggle:hover {
		color: #F0EDE6;
		border-color: #8A8780;
	}

	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	:global([data-theme='dark']) .error-message {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}
</style>
