<script lang="ts">
	import { enhance } from '$app/forms';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Forgot Password - Troop to Task</title>
</svelte:head>

<div class="auth-page">
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
			</svg>
		{/if}
	</button>
	<div class="auth-card">
		<div class="brand">
			<div class="logo">
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
					<path d="M12 8v4l3 3"/>
				</svg>
			</div>
			<h1>Troop to Task</h1>
			<p class="subtitle">Reset your password</p>
		</div>

		{#if form?.success}
			<div class="success-section">
				<div class="success-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
						<polyline points="22,6 12,13 2,6" />
					</svg>
				</div>
				<h2 class="success-title">Check your email</h2>
				<p class="success-text">
					We've sent a password reset link to <strong>{form.email}</strong>
				</p>
				<p class="success-text">
					Click the link in the email to set a new password.
				</p>
			</div>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				{#if form?.error}
					<div class="error-message">
						<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						{form.error}
					</div>
				{/if}

				<p class="instructions">
					Enter the email address associated with your account and we'll send you a link to reset your password.
				</p>

				<div class="form-group">
					<label class="label" for="email">Email Address</label>
					<input
						id="email"
						name="email"
						type="email"
						class="input"
						value={form?.email ?? ''}
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</div>

				<button type="submit" class="btn btn-primary btn-full" disabled={loading}>
					{#if loading}
						<span class="spinner"></span>
						Sending...
					{:else}
						Send Reset Link
					{/if}
				</button>
			</form>
		{/if}

		<div class="divider">
			<span>or</span>
		</div>

		<p class="auth-link">
			Remember your password? <a href="/auth/login">Sign in</a>
		</p>
	</div>

	<footer class="auth-footer">
		<p>Designed for Army Medical Units</p>
	</footer>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--color-primary) 0%, #2c5282 100%);
		padding: var(--spacing-lg);
	}

	.auth-card {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 400px;
	}

	.brand {
		text-align: center;
		margin-bottom: var(--spacing-xl);
	}

	.logo {
		width: 56px;
		height: 56px;
		margin: 0 auto var(--spacing-sm);
		background: var(--color-primary);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.logo svg {
		width: 32px;
		height: 32px;
	}

	.brand h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.instructions {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
		line-height: 1.5;
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

	.success-section {
		text-align: center;
		padding: var(--spacing-md) 0;
	}

	.success-icon {
		width: 64px;
		height: 64px;
		margin: 0 auto var(--spacing-md);
		background: #dcfce7;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #16a34a;
	}

	.success-icon svg {
		width: 32px;
		height: 32px;
	}

	.success-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
		color: var(--color-text);
	}

	.success-text {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-sm);
		line-height: 1.5;
	}

	.success-text strong {
		color: var(--color-text);
	}

	:global([data-theme='dark']) .success-icon {
		background: #14532d;
		color: #4ade80;
	}

	.btn-full {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: var(--spacing-md);
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: white;
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
		color: var(--color-primary);
		font-weight: 600;
		text-decoration: none;
	}

	.auth-link a:hover {
		text-decoration: underline;
	}

	.auth-footer {
		margin-top: var(--spacing-xl);
		text-align: center;
		color: rgba(255, 255, 255, 0.7);
		font-size: var(--font-size-sm);
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.theme-toggle:hover {
		background: rgba(255, 255, 255, 0.3);
		transform: scale(1.05);
	}

	.theme-toggle svg {
		width: 20px;
		height: 20px;
	}

	:global([data-theme='dark']) .auth-page {
		background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
	}

	:global([data-theme='dark']) .error-message {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}
</style>
