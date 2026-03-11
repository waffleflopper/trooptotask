<script lang="ts">
	import { page } from '$app/stores';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const supabase = $derived($page.data.supabase);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);

	let authSubscription: { unsubscribe: () => void } | null = null;

	onMount(() => {
		// Check existing session first
		supabase.auth.getSession().then(({ data: { session } }: any) => {
			if (session) {
				sessionReady = true;
			}
		});

		// Listen for auth state change (token exchange happens async from URL hash)
		const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
			if (event === 'PASSWORD_RECOVERY') {
				sessionReady = true;
			}
		});
		authSubscription = subscription;

		return () => authSubscription?.unsubscribe();
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password.length < 6) {
			error = 'Password must be at least 6 characters';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}

		loading = true;
		try {
			const { error: updateError } = await supabase.auth.updateUser({ password });

			if (updateError) {
				error = updateError.message;
				return;
			}

			success = true;
			setTimeout(() => goto('/auth/login'), 3000);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password - Troop to Task</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-noise"></div>
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
			<div class="brand-mark">T2T</div>
			<h1>Troop to Task</h1>
			<p class="subtitle">Personnel Management System</p>
		</div>

		{#if success}
			<div class="success-section">
				<div class="success-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M20 6L9 17l-5-5" />
					</svg>
				</div>
				<h2 class="success-title">Password updated</h2>
				<p class="success-text">
					Your password has been reset successfully. Redirecting to sign in...
				</p>
			</div>
		{:else if !sessionReady}
			<div class="loading-section">
				<span class="spinner"></span>
				<p class="loading-text">Verifying reset link...</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit}>
				{#if error}
					<div class="error-message">
						<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
							<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						{error}
					</div>
				{/if}

				<div class="form-group">
					<label class="label" for="password">New Password</label>
					<input
						id="password"
						type="password"
						class="input"
						bind:value={password}
						required
						minlength="6"
						autocomplete="new-password"
						placeholder="At least 6 characters"
					/>
				</div>

				<div class="form-group">
					<label class="label" for="confirmPassword">Confirm New Password</label>
					<input
						id="confirmPassword"
						type="password"
						class="input"
						bind:value={confirmPassword}
						required
						minlength="6"
						autocomplete="new-password"
						placeholder="Re-enter your password"
					/>
				</div>

				<button type="submit" class="btn btn-primary btn-full" disabled={loading}>
					{#if loading}
						<span class="spinner"></span>
						Updating...
					{:else}
						Update Password
					{/if}
				</button>
			</form>
		{/if}

		<div class="divider">
			<span>or</span>
		</div>

		<p class="auth-link">
			<a href="/auth/login">Back to sign in</a>
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
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.6875rem;
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
		line-height: 1.5;
	}

	:global([data-theme='dark']) .success-icon {
		background: #14532d;
		color: #4ade80;
	}

	.loading-section {
		text-align: center;
		padding: var(--spacing-xl) 0;
	}

	.loading-section .spinner {
		width: 24px;
		height: 24px;
		border-color: rgba(var(--color-primary-rgb), 0.2);
		border-top-color: var(--color-primary);
	}

	.loading-text {
		margin-top: var(--spacing-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
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
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.75rem;
		position: relative;
	}

	.theme-toggle {
		position: fixed;
		top: var(--spacing-lg);
		right: var(--spacing-lg);
		width: 40px;
		height: 40px;
		border-radius: 6px;
		background: transparent;
		border: 1px solid #2A2A2A;
		color: #8A8780;
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

	:global([data-theme='dark']) .error-message {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
	}
</style>
