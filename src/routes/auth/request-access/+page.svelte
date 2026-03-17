<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let email = $state('');
	let name = $state('');
	let reason = $state('');
	let loading = $state(false);
	let submitted = $state(false);
	let errorMsg = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (loading) return;

		errorMsg = '';
		loading = true;

		try {
			const res = await fetch('/api/access-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, name, reason: reason || undefined })
			});

			if (!res.ok) {
				const data = await res.json();
				errorMsg = data.message || 'Something went wrong. Please try again.';
				return;
			}

			submitted = true;
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Request Access - Troop to Task</title>
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
			{#if submitted}
				<p class="subtitle">Request submitted</p>
			{:else}
				<p class="subtitle">Personnel Management System</p>
			{/if}
		</div>

		{#if submitted}
			<div class="confirm-section">
				<div class="confirm-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				</div>
				<h2 class="confirm-title">We've got your request!</h2>
				<p class="confirm-text">
					We'll review your request and email <strong>{email}</strong> when you're approved.
				</p>
			</div>

			<div class="divider">
				<span>or</span>
			</div>

			<p class="auth-link">
				<a href="/auth/login">Back to sign in</a>
			</p>
		{:else}
			<form onsubmit={handleSubmit}>
				{#if errorMsg}
					<div class="error-message">
						<svg viewBox="0 0 20 20" fill="currentColor" class="error-icon">
							<path
								fill-rule="evenodd"
								d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
								clip-rule="evenodd"
							/>
						</svg>
						{errorMsg}
					</div>
				{/if}

				<div class="form-group">
					<label class="label" for="name">Full Name</label>
					<input
						id="name"
						type="text"
						class="input"
						bind:value={name}
						required
						autocomplete="name"
						placeholder="Your full name"
					/>
				</div>

				<div class="form-group">
					<label class="label" for="email">Email Address</label>
					<input
						id="email"
						type="email"
						class="input"
						bind:value={email}
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</div>

				<div class="form-group">
					<label class="label" for="reason">Reason <span class="optional">(optional)</span></label>
					<textarea
						id="reason"
						class="input textarea"
						bind:value={reason}
						rows="3"
						placeholder="Tell us about your unit or why you'd like access"
					></textarea>
				</div>

				<button type="submit" class="btn btn-primary btn-full" disabled={loading}>
					{#if loading}
						<Spinner />
						Submitting...
					{:else}
						Submit Request
					{/if}
				</button>
			</form>

			<div class="divider">
				<span>or</span>
			</div>

			<p class="auth-link">
				Have an invite code? <a href="/auth/register">Create an account</a>
			</p>
			<p class="auth-link" style="margin-top: var(--spacing-sm);">
				Already have an account? <a href="/auth/login">Sign in</a>
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
		font-size: 0.6875rem;
		font-family: var(--font-mono);
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

	.textarea {
		resize: vertical;
		min-height: 80px;
	}

	.optional {
		font-weight: 400;
		color: var(--color-text-muted);
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

	/* Confirmation styles */
	.confirm-section {
		text-align: center;
		padding: var(--spacing-md) 0;
	}

	.confirm-icon {
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

	.confirm-icon svg {
		width: 32px;
		height: 32px;
	}

	.confirm-title {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-md);
		color: var(--color-text);
	}

	.confirm-text {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: 1.5;
	}

	.confirm-text strong {
		color: var(--color-text);
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
		color: #f0ede6;
		border-color: #8a8780;
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

	:global([data-theme='dark']) .confirm-icon {
		background: #14532d;
		color: #4ade80;
	}
</style>
