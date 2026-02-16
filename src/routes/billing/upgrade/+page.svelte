<script lang="ts">
	import {
		formatPrice,
		getPriceForCycle,
		getMonthlyEquivalent,
		getSavingsPercent,
		getBillingCycleLabel,
		type BillingCycle,
		type SubscriptionPlan
	} from '$lib/types/subscription';

	let { data } = $props();

	let selectedCycle = $state<BillingCycle>(data.currentBillingCycle);
	let loading = $state<string | null>(null);

	function isCurrentPlan(planId: string): boolean {
		return data.currentPlanId === planId;
	}

	function isUpgrade(plan: SubscriptionPlan): boolean {
		const currentPlan = data.plans.find((p) => p.id === data.currentPlanId);
		return currentPlan ? plan.sortOrder > currentPlan.sortOrder : false;
	}

	async function selectPlan(planId: string) {
		if (isCurrentPlan(planId) || planId === 'free') return;

		loading = planId;
		try {
			const res = await fetch('/billing/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ planId, billingCycle: selectedCycle })
			});

			if (res.ok) {
				const { checkoutUrl } = await res.json();
				window.location.href = checkoutUrl;
			}
		} finally {
			loading = null;
		}
	}

	async function openPortal() {
		loading = 'portal';
		try {
			const res = await fetch('/billing/portal', { method: 'POST' });
			if (res.ok) {
				const { portalUrl } = await res.json();
				window.location.href = portalUrl;
			}
		} finally {
			loading = null;
		}
	}
</script>

<svelte:head>
	<title>Upgrade Plan - Troop to Task</title>
</svelte:head>

<div class="upgrade-page">
	<div class="upgrade-container">
		<header class="page-header">
			<a href="/billing" class="back-link">
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M19 12H5M12 19l-7-7 7-7"/>
				</svg>
				Back to Billing
			</a>
			<h1>Choose Your Plan</h1>
			<p class="subtitle">Select the plan that fits your team's needs</p>
		</header>

		<!-- Billing Cycle Toggle -->
		<div class="cycle-toggle">
			<button
				class="cycle-option"
				class:active={selectedCycle === 'monthly'}
				onclick={() => selectedCycle = 'monthly'}
			>
				Monthly
			</button>
			<button
				class="cycle-option"
				class:active={selectedCycle === 'quarterly'}
				onclick={() => selectedCycle = 'quarterly'}
			>
				Quarterly
				<span class="savings">Save 15%</span>
			</button>
			<button
				class="cycle-option"
				class:active={selectedCycle === 'semiannual'}
				onclick={() => selectedCycle = 'semiannual'}
			>
				Semi-annual
				<span class="savings">Save 25%</span>
			</button>
		</div>

		<!-- Plans Grid -->
		<div class="plans-grid">
			{#each data.plans as plan (plan.id)}
				{@const price = getPriceForCycle(plan, selectedCycle)}
				{@const monthlyEquiv = getMonthlyEquivalent(plan, selectedCycle)}
				{@const savings = getSavingsPercent(plan, selectedCycle)}
				{@const isCurrent = isCurrentPlan(plan.id)}
				{@const isUpgradeOption = isUpgrade(plan)}

				<div class="plan-card" class:current={isCurrent} class:popular={plan.id === 'pro'}>
					{#if plan.id === 'pro'}
						<div class="popular-badge">Most Popular</div>
					{/if}

					<div class="plan-header">
						<h2>{plan.name}</h2>
						{#if plan.priceMonthly > 0}
							<div class="plan-price">
								<span class="price">{formatPrice(monthlyEquiv)}</span>
								<span class="period">/month</span>
							</div>
							{#if selectedCycle !== 'monthly' && savings > 0}
								<div class="price-details">
									{formatPrice(price)} billed {getBillingCycleLabel(selectedCycle).toLowerCase()}
								</div>
							{/if}
						{:else}
							<div class="plan-price free">Free</div>
						{/if}
					</div>

					{#if plan.description}
						<p class="plan-description">{plan.description}</p>
					{/if}

					<ul class="plan-features">
						<li>
							<span class="check">✓</span>
							{plan.maxOrganizations === null ? 'Unlimited' : plan.maxOrganizations} organization{plan.maxOrganizations !== 1 ? 's' : ''}
						</li>
						<li>
							<span class="check">✓</span>
							{plan.maxPersonnelPerOrg === null ? 'Unlimited' : plan.maxPersonnelPerOrg} personnel per org
						</li>
						<li class:disabled={!plan.hasDutyRoster}>
							<span class="check">{plan.hasDutyRoster ? '✓' : '✗'}</span>
							Duty Roster Generator
						</li>
						<li class:disabled={!plan.hasBulkImport}>
							<span class="check">{plan.hasBulkImport ? '✓' : '✗'}</span>
							Bulk Import
						</li>
						<li class:disabled={!plan.hasExcelExport}>
							<span class="check">{plan.hasExcelExport ? '✓' : '✗'}</span>
							Excel Export
						</li>
						<li class:disabled={!plan.hasPrioritySupport}>
							<span class="check">{plan.hasPrioritySupport ? '✓' : '✗'}</span>
							Priority Support
						</li>
					</ul>

					<div class="plan-action">
						{#if isCurrent}
							<button class="btn btn-current" disabled>Current Plan</button>
						{:else if plan.id === 'free'}
							{#if data.hasStripeSubscription}
								<button class="btn btn-secondary" onclick={openPortal} disabled={loading === 'portal'}>
									{loading === 'portal' ? 'Loading...' : 'Downgrade'}
								</button>
							{:else}
								<button class="btn btn-secondary" disabled>Current Plan</button>
							{/if}
						{:else}
							<button
								class="btn btn-primary"
								onclick={() => selectPlan(plan.id)}
								disabled={loading === plan.id}
							>
								{#if loading === plan.id}
									Processing...
								{:else if isUpgradeOption}
									Upgrade to {plan.name}
								{:else}
									Select {plan.name}
								{/if}
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="faq-note">
			<p>All plans include a 14-day money-back guarantee. Questions? <a href="/help">Contact support</a></p>
		</div>
	</div>
</div>

<style>
	.upgrade-page {
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-xl);
	}

	.upgrade-container {
		max-width: 1000px;
		margin: 0 auto;
	}

	.page-header {
		text-align: center;
		margin-bottom: var(--spacing-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
	}

	/* Cycle Toggle */
	.cycle-toggle {
		display: flex;
		justify-content: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-2xl);
		padding: var(--spacing-xs);
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		width: fit-content;
		margin-left: auto;
		margin-right: auto;
	}

	.cycle-option {
		position: relative;
		padding: var(--spacing-sm) var(--spacing-lg);
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all 0.15s;
	}

	.cycle-option.active {
		background: var(--color-primary);
		color: white;
	}

	.cycle-option:hover:not(.active) {
		background: var(--color-surface-variant);
	}

	.savings {
		display: block;
		font-size: var(--font-size-xs);
		color: var(--color-success);
		margin-top: 2px;
	}

	.cycle-option.active .savings {
		color: rgba(255, 255, 255, 0.85);
	}

	/* Plans Grid */
	.plans-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-2xl);
	}

	.plan-card {
		position: relative;
		background: var(--color-surface);
		border: 2px solid var(--color-border);
		border-radius: var(--radius-xl);
		padding: var(--spacing-xl);
		display: flex;
		flex-direction: column;
		transition: all 0.2s;
	}

	.plan-card:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.plan-card.current {
		border-color: var(--color-primary);
		background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
	}

	.plan-card.popular {
		border-color: var(--color-primary);
	}

	.popular-badge {
		position: absolute;
		top: -12px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-primary);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 600;
		padding: 4px 12px;
		border-radius: var(--radius-full);
		white-space: nowrap;
	}

	.plan-header {
		margin-bottom: var(--spacing-md);
	}

	.plan-header h2 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.plan-price {
		display: flex;
		align-items: baseline;
		gap: 4px;
	}

	.plan-price .price {
		font-size: var(--font-size-3xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.plan-price .period {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.plan-price.free {
		font-size: var(--font-size-2xl);
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.price-details {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: 4px;
	}

	.plan-description {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.plan-features {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--spacing-xl) 0;
		flex: 1;
	}

	.plan-features li {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.plan-features li.disabled {
		color: var(--color-text-muted);
	}

	.plan-features .check {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		font-size: 12px;
		background: var(--color-success);
		color: white;
	}

	.plan-features li.disabled .check {
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.plan-action {
		margin-top: auto;
	}

	.btn {
		width: 100%;
		padding: var(--spacing-md);
		font-weight: 600;
		font-size: var(--font-size-base);
		border-radius: var(--radius-md);
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-primary {
		background: var(--color-primary);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn-secondary {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-border);
	}

	.btn-current {
		background: var(--color-border);
		color: var(--color-text-muted);
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.faq-note {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.faq-note a {
		color: var(--color-primary);
		text-decoration: none;
	}

	.faq-note a:hover {
		text-decoration: underline;
	}

	@media (max-width: 640px) {
		.upgrade-page {
			padding: var(--spacing-md);
		}

		.cycle-toggle {
			flex-direction: column;
			width: 100%;
		}

		.plans-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
