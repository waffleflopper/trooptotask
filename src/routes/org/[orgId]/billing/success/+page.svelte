<script lang="ts">
	import { page } from '$app/stores';

	const orgId = $derived($page.params.orgId);
</script>

<svelte:head>
	<title>Subscription Active - Troop to Task</title>
</svelte:head>

<div class="page">
	<main class="page-content">
		<div class="result-card">
			<div class="result-icon success">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
			</div>
			<h1>Subscription Active!</h1>
			<p>
				Your plan has been updated. Your organization now has access to the new tier's features and personnel limits.
			</p>
			<div class="result-actions">
				<a href="/org/{orgId}" class="btn btn-primary">Go to Dashboard</a>
				<a href="/org/{orgId}/billing" class="btn btn-secondary">View Billing</a>
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

	.result-icon.success {
		color: var(--color-success, #16a34a);
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
