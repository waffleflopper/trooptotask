<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { Tier } from '$lib/types/subscription';

	let { data } = $props();

	let subscribingTier = $state<string | null>(null);
	let portalLoading = $state(false);
	let errorMessage = $state('');

	const tier = $derived(data.effectiveTier);
	const source = $derived(tier.source);
	const isReadOnly = $derived(tier.isReadOnly);
	const personnelCount = $derived(tier.personnelCount);
	const personnelCap = $derived(tier.personnelCap);
	const giftExpiresAt = $derived(tier.giftExpiresAt);
	const giftTier = $derived(tier.giftTier);

	const giftDaysRemaining = $derived.by(() => {
		if (!giftExpiresAt) return null;
		const diff = new Date(giftExpiresAt).getTime() - Date.now();
		return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
	});

	function formatPrice(cents: number): string {
		if (cents === 0) return 'Free';
		return `$${(cents / 100).toFixed(0)}/mo`;
	}

	function formatCap(cap: number | null): string {
		return cap === null ? 'Unlimited' : String(cap);
	}

	function tierLabel(tierName: Tier): string {
		if (tierName === tier.tier) {
			if (source === 'gift') return 'Gifted';
			if (source === 'subscription') return 'Current Plan';
			return 'Current Plan';
		}
		const tierOrder: Tier[] = ['free', 'team', 'unit'];
		const currentIdx = tierOrder.indexOf(tier.tier);
		const targetIdx = tierOrder.indexOf(tierName);
		if (targetIdx < currentIdx) return 'Downgrade';
		return 'Subscribe';
	}

	function sourceLabel(src: string): string {
		switch (src) {
			case 'subscription':
				return 'Stripe Subscription';
			case 'gift':
				return 'Admin Gift';
			case 'default':
				return 'Free Plan';
			default:
				return src;
		}
	}

	function sourceColor(src: string): string {
		switch (src) {
			case 'subscription':
				return 'var(--color-primary)';
			case 'gift':
				return 'var(--color-success)';
			default:
				return 'var(--color-text-secondary)';
		}
	}

	async function handleSubscribe(selectedTier: string) {
		if (subscribingTier) return;
		subscribingTier = selectedTier;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${data.orgId}/billing/checkout`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: selectedTier })
			});

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to create checkout session';
				subscribingTier = null;
				return;
			}

			window.location.href = result.url;
			// Don't reset subscribingTier — keep button disabled until navigation completes
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
			subscribingTier = null;
		}
	}

	async function handleManageSubscription() {
		if (portalLoading) return;
		portalLoading = true;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${data.orgId}/billing/portal`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to open subscription portal';
				return;
			}

			window.location.href = result.url;
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			portalLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Billing - {data.orgName} - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Billing & Subscription" helpTopic="billing" />

	<main class="page-content">
		{#if isReadOnly}
			<div class="read-only-notice">
				<div class="notice-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
						<path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
					</svg>
				</div>
				<div>
					<strong>Your organization is in read-only mode.</strong>
					<p>
						You have <strong>{personnelCount}</strong> personnel but your plan allows
						<strong>{personnelCap === Infinity ? 'unlimited' : personnelCap}</strong>.
						Subscribe to a higher tier or remove personnel to restore full access.
					</p>
				</div>
			</div>
		{/if}

		{#if errorMessage}
			<div class="error-message">{errorMessage}</div>
		{/if}

		<!-- Current Plan Card -->
		<div class="billing-card">
			<h2>Current Plan</h2>

			<div class="plan-details">
				<div class="plan-header">
					<span class="plan-name">{data.tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier}</span>
					<Badge label={sourceLabel(source)} color={sourceColor(source)} />
				</div>

				<div class="plan-stats">
					<div class="stat">
						<span class="stat-label">Personnel</span>
						<span class="stat-value">
							{personnelCount} / {personnelCap === Infinity ? 'Unlimited' : personnelCap}
						</span>
					</div>
					<div class="stat">
						<span class="stat-label">Status</span>
						<span class="stat-value" class:text-error={isReadOnly}>
							{isReadOnly ? 'Read-Only' : 'Active'}
						</span>
					</div>
				</div>

				{#if source === 'gift' && giftExpiresAt}
					<div class="gift-info">
						<div class="gift-badge">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
							</svg>
							Complimentary {giftTier ? giftTier.charAt(0).toUpperCase() + giftTier.slice(1) : ''} tier
						</div>
						<p class="gift-expires">
							Expires: {new Date(giftExpiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
							{#if giftDaysRemaining !== null}
								({giftDaysRemaining} {giftDaysRemaining === 1 ? 'day' : 'days'} remaining)
							{/if}
						</p>
					</div>
				{/if}

				{#if data.canManageSubscription}
					<button class="btn btn-secondary" onclick={handleManageSubscription} disabled={portalLoading}>
						{#if portalLoading}<Spinner />{/if}
						{portalLoading ? 'Opening...' : 'Manage Subscription'}
					</button>
				{/if}
			</div>
		</div>

		<!-- Pricing Cards -->
		<h2 class="pricing-heading">Plans & Pricing</h2>

		<div class="pricing-grid">
			{#each data.tierComparison as plan}
				{@const isCurrent = plan.tier === tier.tier}
				{@const label = tierLabel(plan.tier)}
				{@const isDowngrade = label === 'Downgrade'}
				<div class="pricing-card" class:current={isCurrent}>
					{#if isCurrent}
						<div class="current-badge">Current</div>
					{/if}

					<div class="pricing-card-header">
						<h3>{plan.name}</h3>
						<div class="price">
							{formatPrice(plan.priceMonthly)}
						</div>
					</div>

					<ul class="features">
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span><strong>{formatCap(plan.personnelCap)}</strong> personnel</span>
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span><strong>{formatCap(plan.maxOrgsOwned)}</strong> {plan.maxOrgsOwned === 1 ? 'organization' : 'organizations'}</span>
						</li>
						<li>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span><strong>{formatCap(plan.bulkExportsPerMonth)}</strong> exports/month</span>
						</li>
					</ul>

					<div class="pricing-card-footer">
						{#if isCurrent}
							<button class="btn btn-secondary" disabled>Current Plan</button>
						{:else if plan.tier === 'free'}
							{#if isDowngrade && data.canManageSubscription}
								<button
									class="btn btn-secondary"
									onclick={handleManageSubscription}
									disabled={portalLoading}
								>
									{#if portalLoading}<Spinner />{/if}
									{portalLoading ? 'Opening...' : 'Manage Subscription'}
								</button>
							{:else}
								<button class="btn btn-secondary" disabled>Free Plan</button>
							{/if}
						{:else if isDowngrade && data.canManageSubscription}
							<button
								class="btn btn-secondary"
								onclick={handleManageSubscription}
								disabled={portalLoading}
							>
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Downgrade'}
							</button>
						{:else}
							<button
								class="btn btn-primary"
								onclick={() => handleSubscribe(plan.tier)}
								disabled={!!subscribingTier}
							>
								{#if subscribingTier === plan.tier}<Spinner />{/if}
								{subscribingTier === plan.tier ? 'Redirecting...' : 'Subscribe'}
							</button>
						{/if}
					</div>
				</div>
			{/each}
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
		max-width: 960px;
		margin: 0 auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
		width: 100%;
	}

	/* Read-Only Notice */
	.read-only-notice {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-md) var(--spacing-lg);
		border-radius: var(--radius-lg);
	}

	.read-only-notice .notice-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.read-only-notice p {
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-sm);
		line-height: 1.5;
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}

	/* Current Plan Card */
	.billing-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.billing-card h2 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		margin-bottom: var(--spacing-md);
	}

	.plan-details {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.plan-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.plan-name {
		font-size: 24px;
		font-weight: 600;
		color: var(--color-text);
	}

	.plan-stats {
		display: flex;
		gap: var(--spacing-xl);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.stat-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value {
		font-size: var(--font-size-lg);
		font-weight: 500;
		color: var(--color-text);
	}

	.text-error {
		color: var(--color-error, #dc2626);
	}

	/* Gift Info */
	.gift-info {
		background: var(--color-surface-variant, #f8fafc);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
	}

	.gift-badge {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-weight: 500;
		color: var(--color-success, #16a34a);
		margin-bottom: var(--spacing-xs);
	}

	.gift-expires {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	/* Pricing Section */
	.pricing-heading {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 400;
		margin: 0;
	}

	.pricing-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-md);
	}

	.pricing-card {
		position: relative;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.pricing-card.current {
		border-color: var(--color-primary);
		border-width: 2px;
	}

	.current-badge {
		position: absolute;
		top: -10px;
		right: var(--spacing-md);
		background: var(--color-primary);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
	}

	.pricing-card-header {
		text-align: center;
	}

	.pricing-card-header h3 {
		font-family: var(--font-display);
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-xs);
	}

	.price {
		font-size: 28px;
		font-weight: 700;
		color: var(--color-primary);
	}

	.features {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		flex: 1;
	}

	.features li {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text);
	}

	.features li svg {
		flex-shrink: 0;
		color: var(--color-success, #16a34a);
	}

	.pricing-card-footer {
		margin-top: auto;
	}

	.pricing-card-footer .btn {
		width: 100%;
	}

	/* Mobile Responsive */
	@media (max-width: 768px) {
		.pricing-grid {
			grid-template-columns: 1fr;
		}

		.page-content {
			padding: var(--spacing-md);
		}

		.plan-stats {
			flex-direction: column;
			gap: var(--spacing-sm);
		}
	}

	/* Tablet */
	@media (min-width: 769px) and (max-width: 1024px) {
		.page-content {
			padding: var(--spacing-md);
		}
	}
</style>
