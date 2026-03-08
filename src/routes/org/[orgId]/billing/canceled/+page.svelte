<script lang="ts">
	import { page } from '$app/stores';

	const orgId = $derived($page.params.orgId);
</script>

<svelte:head>
	<title>Subscription Canceled - Troop to Task</title>
</svelte:head>

<div class="page">
	<main class="page-content">
		<div class="result-card">
			<div class="result-icon canceled">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			</div>
			<h1>Subscription Setup Canceled</h1>
			<p>No charges were made. You can try again anytime from the billing page.</p>
			<div class="result-actions">
				<a href="/org/{orgId}/billing" class="btn btn-primary">Back to Billing</a>
				<a href="/org/{orgId}" class="btn btn-secondary">Go to Dashboard</a>
			</div>
		</div>
	</main>
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-lg);
	}

	.result-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		text-align: center;
		max-width: 480px;
		width: 100%;
	}

	.result-icon {
		margin-bottom: var(--spacing-md);
	}

	.result-icon.canceled {
		color: var(--color-text-muted);
	}

	h1 {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		margin-bottom: var(--spacing-md);
		color: var(--color-text);
	}

	p {
		font-size: var(--font-size-base);
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin-bottom: var(--spacing-lg);
	}

	.result-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
	}

	@media (max-width: 640px) {
		.result-actions {
			flex-direction: column;
		}
	}
</style>
