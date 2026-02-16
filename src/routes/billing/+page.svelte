<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import {
		formatPrice,
		getStatusLabel,
		getStatusColor,
		getBillingCycleLabel
	} from '$lib/types/subscription';

	let { data } = $props();

	let portalLoading = $state(false);

	// Load data into store
	$effect(() => {
		subscriptionStore.loadPlans(data.allPlans);
	});

	async function openPortal() {
		portalLoading = true;
		try {
			const res = await fetch('/billing/portal', { method: 'POST' });
			if (res.ok) {
				const { portalUrl } = await res.json();
				window.location.href = portalUrl;
			}
		} finally {
			portalLoading = false;
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '-';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Billing - Troop to Task</title>
</svelte:head>

<div class="billing-page">
	<div class="billing-container">
		<header class="page-header">
			<h1>Billing & Subscription</h1>
			<a href="/dashboard" class="back-link">Back to Dashboard</a>
		</header>

		<!-- Current Plan Card -->
		<section class="card current-plan">
			<div class="plan-header">
				<div class="plan-info">
					<h2>{data.plan.name} Plan</h2>
					<span class="status-badge" style="--status-color: {getStatusColor(data.subscription.status)}">
						{getStatusLabel(data.subscription.status)}
					</span>
				</div>
				{#if data.plan.priceMonthly > 0}
					<div class="plan-price">
						<span class="price">{formatPrice(data.plan.priceMonthly)}</span>
						<span class="period">/month</span>
					</div>
				{:else}
					<div class="plan-price free">Free</div>
				{/if}
			</div>

			{#if data.plan.description}
				<p class="plan-description">{data.plan.description}</p>
			{/if}

			<div class="plan-details">
				{#if data.subscription.status === 'trialing' && data.limits.trialDaysRemaining !== null}
					<div class="detail-item trial">
						<span class="label">Trial ends in</span>
						<span class="value">{data.limits.trialDaysRemaining} days</span>
					</div>
				{/if}

				{#if data.subscription.billingCycle !== 'monthly' && data.subscription.hasStripeSubscription}
					<div class="detail-item">
						<span class="label">Billing cycle</span>
						<span class="value">{getBillingCycleLabel(data.subscription.billingCycle)}</span>
					</div>
				{/if}

				{#if data.subscription.currentPeriodEnd && data.subscription.status === 'active'}
					<div class="detail-item">
						<span class="label">Next billing date</span>
						<span class="value">{formatDate(data.subscription.currentPeriodEnd)}</span>
					</div>
				{/if}

				{#if data.subscription.canceledAt}
					<div class="detail-item warning">
						<span class="label">Cancels on</span>
						<span class="value">{formatDate(data.subscription.currentPeriodEnd)}</span>
					</div>
				{/if}
			</div>

			<div class="plan-actions">
				{#if data.plan.priceMonthly === 0}
					<a href="/billing/upgrade" class="btn btn-primary">
						Upgrade Plan
					</a>
				{:else if data.subscription.hasStripeSubscription}
					<button class="btn btn-secondary" onclick={openPortal} disabled={portalLoading}>
						{portalLoading ? 'Loading...' : 'Manage Subscription'}
					</button>
					<a href="/billing/upgrade" class="btn btn-outline">
						Change Plan
					</a>
				{/if}
			</div>
		</section>

		<!-- Usage & Limits -->
		<section class="card usage-section">
			<h2>Usage & Limits</h2>
			<div class="usage-grid">
				<div class="usage-item">
					<div class="usage-header">
						<span class="usage-label">Organizations</span>
						<span class="usage-value">
							{data.limits.currentOrganizations}
							{#if data.limits.maxOrganizations !== null}
								/ {data.limits.maxOrganizations}
							{:else}
								<span class="unlimited">Unlimited</span>
							{/if}
						</span>
					</div>
					{#if data.limits.maxOrganizations !== null}
						<div class="usage-bar">
							<div
								class="usage-fill"
								style="width: {Math.min(100, (data.limits.currentOrganizations / data.limits.maxOrganizations) * 100)}%"
							></div>
						</div>
					{/if}
				</div>

				<div class="usage-item">
					<div class="usage-header">
						<span class="usage-label">Personnel per Org</span>
						<span class="usage-value">
							{#if data.limits.maxPersonnelPerOrg !== null}
								Up to {data.limits.maxPersonnelPerOrg}
							{:else}
								<span class="unlimited">Unlimited</span>
							{/if}
						</span>
					</div>
				</div>
			</div>

			<div class="features-list">
				<h3>Features</h3>
				<ul>
					<li class:included={data.limits.hasDutyRoster}>
						<span class="feature-icon">{data.limits.hasDutyRoster ? '✓' : '✗'}</span>
						Duty Roster Generator
					</li>
					<li class:included={data.limits.hasBulkImport}>
						<span class="feature-icon">{data.limits.hasBulkImport ? '✓' : '✗'}</span>
						Bulk Import
					</li>
					<li class:included={data.limits.hasExcelExport}>
						<span class="feature-icon">{data.limits.hasExcelExport ? '✓' : '✗'}</span>
						Excel Export
					</li>
					<li class:included={data.limits.hasPrioritySupport}>
						<span class="feature-icon">{data.limits.hasPrioritySupport ? '✓' : '✗'}</span>
						Priority Support
					</li>
				</ul>
			</div>
		</section>

		<!-- Payment History -->
		{#if data.paymentHistory.length > 0}
			<section class="card payment-history">
				<h2>Payment History</h2>
				<div class="payments-table">
					<table>
						<thead>
							<tr>
								<th>Date</th>
								<th>Description</th>
								<th>Amount</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each data.paymentHistory as payment (payment.id)}
								<tr>
									<td>{formatDate(payment.createdAt)}</td>
									<td>{payment.description || 'Subscription payment'}</td>
									<td>{formatPrice(payment.amount)}</td>
									<td>
										<span class="payment-status" class:succeeded={payment.status === 'succeeded'} class:failed={payment.status === 'failed'}>
											{payment.status}
										</span>
									</td>
									<td>
										{#if payment.receiptUrl}
											<a href={payment.receiptUrl} target="_blank" rel="noopener" class="receipt-link">
												Receipt
											</a>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	</div>
</div>

<style>
	.billing-page {
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-xl);
	}

	.billing-container {
		max-width: 800px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 600;
		color: var(--color-text);
	}

	.back-link {
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		margin-bottom: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	/* Current Plan */
	.plan-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-md);
	}

	.plan-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.plan-info h2 {
		margin: 0;
	}

	.status-badge {
		font-size: var(--font-size-xs);
		font-weight: 500;
		padding: 4px 10px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--status-color) 15%, transparent);
		color: var(--status-color);
	}

	.plan-price {
		text-align: right;
	}

	.plan-price .price {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.plan-price .period {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.plan-price.free {
		font-size: var(--font-size-xl);
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.plan-description {
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.plan-details {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-lg);
		padding: var(--spacing-md) 0;
		border-top: 1px solid var(--color-border);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--spacing-lg);
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.detail-item .label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detail-item .value {
		font-weight: 500;
		color: var(--color-text);
	}

	.detail-item.trial .value {
		color: var(--color-primary);
	}

	.detail-item.warning .value {
		color: var(--color-warning);
	}

	.plan-actions {
		display: flex;
		gap: var(--spacing-md);
	}

	/* Usage Section */
	.usage-grid {
		display: grid;
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
	}

	.usage-item {
		padding: var(--spacing-md);
		background: var(--color-surface-variant);
		border-radius: var(--radius-md);
	}

	.usage-header {
		display: flex;
		justify-content: space-between;
		margin-bottom: var(--spacing-sm);
	}

	.usage-label {
		font-weight: 500;
		color: var(--color-text);
	}

	.usage-value {
		color: var(--color-text-muted);
	}

	.unlimited {
		color: var(--color-success);
		font-weight: 500;
	}

	.usage-bar {
		height: 8px;
		background: var(--color-border);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.usage-fill {
		height: 100%;
		background: var(--color-primary);
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.features-list h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-md);
	}

	.features-list ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--spacing-sm);
	}

	.features-list li {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
	}

	.features-list li.included {
		color: var(--color-text);
	}

	.feature-icon {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
	}

	.features-list li.included .feature-icon {
		background: var(--color-success);
		color: white;
	}

	.features-list li:not(.included) .feature-icon {
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	/* Payment History */
	.payments-table {
		overflow-x: auto;
	}

	.payments-table table {
		width: 100%;
		border-collapse: collapse;
	}

	.payments-table th,
	.payments-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.payments-table th {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.payments-table td {
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.payment-status {
		font-size: var(--font-size-xs);
		font-weight: 500;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		text-transform: capitalize;
	}

	.payment-status.succeeded {
		background: color-mix(in srgb, var(--color-success) 15%, transparent);
		color: var(--color-success);
	}

	.payment-status.failed {
		background: color-mix(in srgb, var(--color-error) 15%, transparent);
		color: var(--color-error);
	}

	.receipt-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: var(--font-size-sm);
	}

	.receipt-link:hover {
		text-decoration: underline;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-sm) var(--spacing-lg);
		font-weight: 500;
		font-size: var(--font-size-sm);
		border-radius: var(--radius-md);
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s;
		border: none;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
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

	.btn-outline {
		background: transparent;
		border: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.btn-outline:hover {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.billing-page {
			padding: var(--spacing-md);
		}

		.page-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-sm);
		}

		.plan-header {
			flex-direction: column;
			gap: var(--spacing-md);
		}

		.plan-actions {
			flex-direction: column;
		}

		.plan-actions .btn {
			width: 100%;
		}
	}
</style>
