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
			<p class="eyebrow">Billing Update</p>
			<div class="result-icon success">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
					<polyline points="22 4 12 14.01 9 11.01" />
				</svg>
			</div>
			<h1>Subscription Active!</h1>
			<p class="message">
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
		background: var(--surface-page);
	}

	.page-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-6);
	}

	.result-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-6);
		max-width: 520px;
		width: 100%;
	}

	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.result-icon {
		width: 72px;
		height: 72px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
	}

	.result-icon.success {
		color: var(--success);
		background: color-mix(in srgb, var(--success-bg) 82%, var(--surface-panel) 18%);
		border: var(--border-thin);
	}

	h1 {
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 5vw, 3rem);
		line-height: 0.95;
		font-weight: 800;
		text-transform: uppercase;
		margin: 0;
		color: var(--text-strong);
	}

	.message {
		margin: 0;
		font-size: var(--text-base);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.result-actions {
		display: flex;
		gap: var(--sp-3);
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-4);
		}

		.result-card {
			padding: var(--sp-5);
		}

		.result-actions {
			flex-direction: column;
		}
	}
</style>
