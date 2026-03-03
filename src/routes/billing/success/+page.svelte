<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let sessionId = $derived($page.url.searchParams.get('session_id'));
</script>

<svelte:head>
	<title>Payment Successful - Troop to Task</title>
</svelte:head>

<div class="success-page">
	<div class="success-card">
		<div class="success-icon">
			<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
				<polyline points="22 4 12 14.01 9 11.01"></polyline>
			</svg>
		</div>

		<h1>Payment Successful!</h1>
		<p class="message">
			Thank you for your subscription. Your account has been upgraded and you now have access to all your new features.
		</p>

		<div class="actions">
			<a href="/billing" class="btn btn-primary">View Subscription</a>
			<a href="/dashboard" class="btn btn-secondary">Go to Dashboard</a>
		</div>

		<p class="note">
			A confirmation email has been sent to your email address.
		</p>
	</div>
</div>

<style>
	.success-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-xl);
	}

	.success-card {
		background: var(--color-surface);
		border-radius: var(--radius-xl);
		padding: var(--spacing-2xl);
		max-width: 480px;
		width: 100%;
		text-align: center;
		box-shadow: var(--shadow-3);
	}

	.success-icon {
		width: 100px;
		height: 100px;
		margin: 0 auto var(--spacing-xl);
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-success);
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
</style>
