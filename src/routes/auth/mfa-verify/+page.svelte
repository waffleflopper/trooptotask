<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const supabase = $derived($page.data.supabase);
	import { themeStore } from '$lib/stores/theme.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let code = $state('');
	let error = $state('');
	let loading = $state(false);

	function handleCodeInput(e: Event) {
		const input = e.target as HTMLInputElement;
		code = input.value.replace(/\D/g, '').slice(0, 6);
	}

	async function handleVerify(e: Event) {
		e.preventDefault();

		if (!code || code.length !== 6) {
			error = 'Please enter a 6-digit code';
			return;
		}

		error = '';
		loading = true;
		try {
			const { data: factors } = await supabase.auth.mfa.listFactors();
			const totpFactors = factors?.totp ?? [];
			const verifiedFactor = totpFactors.find((f: any) => f.status === 'verified');

			if (!verifiedFactor) {
				error = 'No MFA factor found. Please contact support.';
				return;
			}

			const { data, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
				factorId: verifiedFactor.id,
				code
			});

			if (verifyError) {
				error = verifyError.message;
				return;
			}

			goto('/dashboard');
		} catch (e: any) {
			error = e.message || 'Verification failed';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Two-Factor Authentication - Troop to Task</title>
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
				<path
					d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
				/>
			</svg>
		{/if}
	</button>
	<div class="auth-card">
		<div class="brand">
			<div class="brand-mark">T2T</div>
			<h1>Troop to Task</h1>
			<p class="subtitle">Personnel Management System</p>
		</div>

		<div class="mfa-section">
			<h2 class="mfa-title">Two-Factor Authentication</h2>
			<p class="mfa-description">Enter the 6-digit code from your authenticator app</p>

			<form onsubmit={handleVerify}>
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
					<label class="label" for="mfa-code">Verification Code</label>
					<input
						id="mfa-code"
						type="text"
						class="input code-input"
						value={code}
						oninput={handleCodeInput}
						placeholder="000000"
						maxlength="6"
						autocomplete="one-time-code"
						inputmode="numeric"
					/>
				</div>

				<button type="submit" class="btn btn-primary btn-full" disabled={loading || code.length !== 6}>
					{#if loading}
						<Spinner />
						Verifying...
					{:else}
						Verify
					{/if}
				</button>
			</form>
		</div>

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

	.mfa-section {
		text-align: center;
	}

	.mfa-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin: 0 0 var(--spacing-sm) 0;
	}

	.mfa-description {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin: 0 0 var(--spacing-lg) 0;
	}

	.code-input {
		font-family: var(--font-mono);
		font-size: var(--font-size-lg);
		letter-spacing: 0.3em;
		text-align: center;
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
		text-align: left;
	}

	.error-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	:global([data-theme='dark']) .error-message {
		background: #450a0a;
		border-color: #7f1d1d;
		color: #fca5a5;
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
</style>
