<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { themeStore } from '$lib/stores/theme.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { onMount } from 'svelte';

	const supabase = $derived($page.data.supabase);
	const hasSession = $derived($page.data.hasSession);

	let password = $state('');
	let confirmPassword = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state(false);
	let sessionReady = $state(false);
	let tokenError = $state(false);

	const hasMinLength = $derived(password.length >= 12);
	const hasUppercase = $derived(/[A-Z]/.test(password));
	const hasLowercase = $derived(/[a-z]/.test(password));
	const hasDigit = $derived(/\d/.test(password));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const canSubmit = $derived(hasMinLength && hasUppercase && hasLowercase && hasDigit && passwordsMatch && !loading);

	onMount(async () => {
		// If server already exchanged a PKCE code, session is ready
		if (hasSession) {
			sessionReady = true;
			return;
		}

		// Extract tokens from URL hash (Supabase invite uses implicit flow with hash fragments)
		const hash = window.location.hash.substring(1);
		if (hash) {
			const params = new URLSearchParams(hash);
			const accessToken = params.get('access_token');
			const refreshToken = params.get('refresh_token');

			if (accessToken && refreshToken) {
				const { error: sessionError } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken
				});
				if (!sessionError) {
					sessionReady = true;
					// Clean up the hash from the URL
					window.history.replaceState(null, '', window.location.pathname);
					return;
				}
			}
		}

		// Fallback: check if session already exists
		const {
			data: { session: existingSession }
		} = // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase auth getSession returns complex internal type
			(await supabase.auth.getSession()) as any;
		if (existingSession) {
			sessionReady = true;
			return;
		}

		// If nothing worked, show error
		tokenError = true;
	});
</script>

<svelte:head>
	<title>Accept Invite - Troop to Task</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-noise"></div>
	<button class="theme-toggle" onclick={() => themeStore.toggle()} aria-label="Toggle theme">
		{#if themeStore.isDark}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="currentColor">
				<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
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
				<h2 class="success-title">Account activated</h2>
				<p class="success-text">Your password has been set. Redirecting to your dashboard...</p>
			</div>
		{:else if tokenError}
			<div class="error-message">
				<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
					<path
						fill-rule="evenodd"
						d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
						clip-rule="evenodd"
					/>
				</svg>
				This invite link is invalid or has expired.
			</div>
			<p class="auth-link">
				<a href="/auth/login">Back to sign in</a>
			</p>
		{:else if !sessionReady}
			<div class="loading-section">
				<Spinner />
				<p class="loading-text">Verifying invite link...</p>
			</div>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					error = '';
					return async ({ result }) => {
						loading = false;
						if (result.type === 'failure') {
							error = (result.data as { error?: string })?.error ?? 'Something went wrong';
						} else if (result.type === 'redirect') {
							success = true;
							setTimeout(() => goto(result.location), 2000);
						}
					};
				}}
			>
				{#if error}
					<div class="error-message">
						<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
						{error}
					</div>
				{/if}

				<div class="form-group">
					<label class="label" for="password">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						class="input"
						bind:value={password}
						required
						minlength="12"
						autocomplete="new-password"
						placeholder="At least 12 characters"
					/>
					<div class="password-requirements">
						Must be 12+ characters with at least one uppercase letter, one lowercase letter, and one digit.
					</div>
				</div>

				<div class="form-group">
					<label class="label" for="confirmPassword">Confirm Password</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						class="input"
						bind:value={confirmPassword}
						required
						minlength="12"
						autocomplete="new-password"
						placeholder="Re-enter your password"
					/>
				</div>

				<button type="submit" class="btn btn-primary btn-full" disabled={!canSubmit}>
					{#if loading}
						<Spinner />
						Setting password...
					{:else}
						Set Password
					{/if}
				</button>
			</form>
		{/if}

		{#if !tokenError}
			<div class="divider">
				<span>or</span>
			</div>

			<p class="auth-link">
				<a href="/auth/login">Back to sign in</a>
			</p>
		{/if}
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
		background: #0f0f0f;
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
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
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
		background: #b8943e;
		color: #0f0f0f;
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

	.loading-text {
		margin-top: var(--spacing-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.password-requirements {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
		line-height: 1.4;
	}

	.btn-full {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: var(--spacing-md);
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
		border: 1px solid #2a2a2a;
		color: #8a8780;
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
