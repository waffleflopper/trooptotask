<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
	let demoLoading = $state(false);
</script>

<svelte:head>
	<title>Sign In - Troop to Task</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<div class="brand">
			<div class="logo">
				<svg viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
					<path d="M12 8v4l3 3"/>
				</svg>
			</div>
			<h1>Troop to Task</h1>
			<p class="subtitle">Army Clinic Staff Scheduling</p>
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
				<div class="error-message">
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
					required
					autocomplete="current-password"
					placeholder="Enter your password"
				/>
			</div>

			<button type="submit" class="btn btn-primary btn-full" disabled={loading}>
				{#if loading}
					<span class="spinner"></span>
					Signing in...
				{:else}
					Sign In
				{/if}
			</button>
		</form>

		<div class="divider">
			<span>or</span>
		</div>

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
			<button type="submit" class="btn btn-demo btn-full" disabled={demoLoading || loading}>
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

		<p class="demo-hint">Explore with sample data - no account needed</p>

		<div class="divider">
			<span>new here?</span>
		</div>

		<p class="auth-link">
			Have an invite code? <a href="/auth/register">Create an account</a>
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

	.btn-demo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		background: linear-gradient(135deg, #059669 0%, #047857 100%);
		border: none;
		color: white;
		font-weight: 600;
	}

	.btn-demo:hover:not(:disabled) {
		background: linear-gradient(135deg, #047857 0%, #065f46 100%);
	}

	.demo-icon {
		width: 18px;
		height: 18px;
	}

	.demo-spinner {
		border-color: rgba(255, 255, 255, 0.3);
		border-top-color: white;
	}

	.demo-hint {
		text-align: center;
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-sm);
	}

	.auth-footer {
		margin-top: var(--spacing-xl);
		text-align: center;
		color: rgba(255, 255, 255, 0.7);
		font-size: var(--font-size-sm);
	}
</style>
