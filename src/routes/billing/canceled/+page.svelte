<script lang="ts">
</script>

<svelte:head>
	<title>Checkout Canceled - Troop to Task</title>
</svelte:head>

<div class="canceled-page">
	<div class="canceled-card">
		<div class="canceled-icon">
			<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="15" y1="9" x2="9" y2="15"></line>
				<line x1="9" y1="9" x2="15" y2="15"></line>
			</svg>
		</div>

		<h1>Checkout Canceled</h1>
		<p class="message">
			No worries! Your checkout was canceled and you haven't been charged. You can upgrade anytime when you're ready.
		</p>

		<div class="actions">
			<a href="/billing/upgrade" class="btn btn-primary">View Plans</a>
			<a href="/dashboard" class="btn btn-secondary">Go to Dashboard</a>
		</div>

		<p class="note">
			Questions? <a href="/help">Contact our support team</a>
		</p>
	</div>
</div>

<style>
	.canceled-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-xl);
	}

	.canceled-card {
		background: var(--color-surface);
		border-radius: var(--radius-xl);
		padding: var(--spacing-2xl);
		max-width: 480px;
		width: 100%;
		text-align: center;
		box-shadow: var(--shadow-3);
	}

	.canceled-icon {
		width: 100px;
		height: 100px;
		margin: 0 auto var(--spacing-xl);
		background: color-mix(in srgb, var(--color-text-muted) 15%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-muted);
	}

	h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	.message {
		color: var(--color-text-muted);
		line-height: 1.6;
		margin-bottom: var(--spacing-xl);
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xl);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-md);
		font-weight: 500;
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: all 0.15s;
	}

	.btn-primary {
		background: var(--color-primary);
		color: #0F0F0F;
	}

	.btn-primary:hover {
		background: var(--color-primary-hover);
	}

	.btn-secondary {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.btn-secondary:hover {
		background: var(--color-border);
	}

	.note {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.note a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.note a:hover {
		text-decoration: underline;
	}
</style>
