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
			<p class="eyebrow">Billing Update</p>
			<div class="result-icon canceled">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="36" height="36">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
			</div>
			<h1>Subscription Setup Canceled</h1>
			<p class="message">No charges were made. You can return to billing and try again whenever you are ready.</p>
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

	.result-icon.canceled {
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
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
