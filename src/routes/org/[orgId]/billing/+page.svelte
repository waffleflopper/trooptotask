<script lang="ts">
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { EffectiveTier, Tier } from '$lib/types/subscription';

	let { data } = $props();

	import { invalidateAll } from '$app/navigation';

	let subscribingTier = $state<string | null>(null);
	let portalLoading = $state(false);
	let cancelLoading = $state(false);
	let errorMessage = $state('');

	const fallbackTier: EffectiveTier = {
		tier: 'free',
		source: 'default',
		personnelCount: 0,
		personnelCap: 15,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	};

	const tier = $derived<EffectiveTier>(data.effectiveTier ?? fallbackTier);
	const tierComparison = $derived(data.tierComparison ?? []);
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
				return 'var(--amber)';
			case 'gift':
				return 'var(--success)';
			default:
				return 'var(--text-secondary)';
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

	async function handleCancelSubscription() {
		if (cancelLoading) return;
		if (
			!confirm(
				'Are you sure you want to cancel your subscription immediately? Your organization will revert to the Free tier.'
			)
		) {
			return;
		}
		cancelLoading = true;
		errorMessage = '';

		try {
			const res = await fetch(`/org/${data.orgId}/billing/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await res.json();
			if (!res.ok) {
				errorMessage = result.error || 'Failed to cancel subscription';
				return;
			}

			await invalidateAll();
		} catch {
			errorMessage = 'An unexpected error occurred. Please try again.';
		} finally {
			cancelLoading = false;
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
						<strong>{personnelCap === Infinity ? 'unlimited' : personnelCap}</strong>. Subscribe to a higher tier or
						remove personnel to restore full access.
					</p>
				</div>
			</div>
		{/if}

		{#if errorMessage}
			<div class="error-message">{errorMessage}</div>
		{/if}

		<div class="overview-strip">
			<div class="overview-card">
				<span class="overview-label">Current Plan</span>
				<strong class="overview-value">{tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier}</strong>
				<span class="overview-meta"
					>{isReadOnly
						? 'Organization access is limited right now'
						: 'Organization access is active and available'}</span
				>
			</div>
			<div class="overview-card">
				<span class="overview-label">Personnel Usage</span>
				<strong class="overview-value"
					>{personnelCount} / {personnelCap === Infinity ? 'Unlimited' : personnelCap}</strong
				>
				<span class="overview-meta">Current headcount against the plan limit</span>
			</div>
			<div class="overview-card">
				<span class="overview-label">Plan Source</span>
				<strong class="overview-value">{sourceLabel(source)}</strong>
				<span class="overview-meta"
					>{source === 'gift'
						? 'Access is currently being granted outside Stripe billing'
						: 'How this subscription is currently being applied'}</span
				>
			</div>
		</div>

		<div class="billing-card">
			<div class="section-heading">
				<p class="section-label">Subscription</p>
				<div class="plan-header">
					<h2>Current Plan:</h2>
					<span class="plan-name">{tierComparison.find((t) => t.tier === tier.tier)?.name ?? tier.tier}</span>
					<Badge label={sourceLabel(source)} color={sourceColor(source)} />
				</div>
			</div>

			<div class="plan-details">
				{#if source === 'gift' && giftExpiresAt}
					<div class="gift-info">
						<div class="gift-badge">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
								<path
									d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"
								/>
							</svg>
							Complimentary {giftTier ? giftTier.charAt(0).toUpperCase() + giftTier.slice(1) : ''} tier
						</div>
						<p class="gift-expires">
							Expires: {new Date(giftExpiresAt).toLocaleDateString('en-US', {
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							})}
							{#if giftDaysRemaining !== null}
								({giftDaysRemaining} {giftDaysRemaining === 1 ? 'day' : 'days'} remaining)
							{/if}
						</p>
					</div>
				{/if}

				{#if data.canManageSubscription}
					<div class="plan-actions">
						<button class="btn btn-secondary" onclick={handleManageSubscription} disabled={portalLoading}>
							{#if portalLoading}<Spinner />{/if}
							{portalLoading ? 'Opening...' : 'Manage Subscription'}
						</button>
						<button class="btn btn-danger" onclick={handleCancelSubscription} disabled={cancelLoading}>
							{#if cancelLoading}<Spinner />{/if}
							{cancelLoading ? 'Canceling...' : 'Cancel Subscription'}
						</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="pricing-header">
			<div class="section-heading">
				<p class="section-label">Pricing</p>
				<h2 class="pricing-heading">Plans & Pricing</h2>
			</div>
			<p class="pricing-copy">Choose the plan that matches your organization size and export needs.</p>
		</div>

		<div class="pricing-grid">
			{#each tierComparison as plan}
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
							<span
								><strong>{formatCap(plan.maxOrgsOwned)}</strong>
								{plan.maxOrgsOwned === 1 ? 'organization' : 'organizations'}</span
							>
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
								<button class="btn btn-secondary" onclick={handleManageSubscription} disabled={portalLoading}>
									{#if portalLoading}<Spinner />{/if}
									{portalLoading ? 'Opening...' : 'Manage Subscription'}
								</button>
							{:else}
								<button class="btn btn-secondary" disabled>Free Plan</button>
							{/if}
						{:else if isDowngrade && data.canManageSubscription}
							<button class="btn btn-secondary" onclick={handleManageSubscription} disabled={portalLoading}>
								{#if portalLoading}<Spinner />{/if}
								{portalLoading ? 'Opening...' : 'Downgrade'}
							</button>
						{:else}
							<button class="btn btn-primary" onclick={() => handleSubscribe(plan.tier)} disabled={!!subscribingTier}>
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
		background: var(--surface-page);
	}

	.page-content {
		flex: 1;
		max-width: 1120px;
		margin: 0 auto;
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		width: 100%;
	}

	.overview-strip {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--sp-3);
	}

	.overview-card {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.overview-label,
	.section-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.overview-label {
		color: var(--text-muted);
	}

	.section-label {
		margin: 0;
		color: var(--amber);
	}

	.overview-value {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 4vw, 2.5rem);
		line-height: 0.95;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.overview-meta {
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.read-only-notice {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--danger);
		padding: var(--sp-4);
		border-radius: var(--radius-lg);
	}

	.read-only-notice .notice-icon {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.read-only-notice p {
		margin-top: var(--sp-1);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.error-message {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border: var(--border-thin);
		color: var(--danger);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.billing-card {
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.billing-card h2,
	.pricing-heading {
		margin: 0;
		font-family: var(--font-display);
		font-size: clamp(2rem, 4vw, 2.8rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
	}

	.plan-details {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.plan-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.plan-name {
		font-size: clamp(2rem, 4vw, 2.8rem);
		font-family: var(--font-display);
		font-weight: 600;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.plan-actions {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.gift-info {
		background: color-mix(in srgb, var(--success-bg) 82%, var(--surface-panel) 18%);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
	}

	.gift-badge {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-weight: 500;
		color: var(--success);
		margin-bottom: var(--sp-2);
	}

	.gift-expires {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
	}

	.pricing-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.pricing-copy {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.pricing-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-3);
	}

	.pricing-card {
		position: relative;
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.pricing-card.current {
		border-color: var(--amber);
	}

	.current-badge {
		position: absolute;
		top: var(--sp-3);
		right: var(--sp-3);
		background: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		color: var(--amber-dark);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		padding: var(--sp-1) var(--sp-2);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
	}

	.pricing-card-header {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.pricing-card-header h3 {
		font-family: var(--font-display);
		font-size: clamp(1.9rem, 3vw, 2.4rem);
		line-height: 0.98;
		font-weight: 700;
		text-transform: uppercase;
		margin: 0;
	}

	.price {
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 4vw, 3rem);
		font-weight: 700;
		line-height: 0.95;
		color: var(--text-strong);
	}

	.features {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		flex: 1;
	}

	.features li {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
		font-size: var(--text-sm);
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.features li svg {
		flex-shrink: 0;
		color: var(--success);
		margin-top: 1px;
	}

	.pricing-card-footer {
		margin-top: auto;
		padding-top: var(--sp-4);
		border-top: var(--border-thin);
	}

	.pricing-card-footer .btn {
		width: 100%;
	}

	@media (max-width: 900px) {
		.pricing-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 768px) {
		.pricing-grid {
			grid-template-columns: 1fr;
		}

		.page-content {
			padding: var(--sp-4);
		}

		.plan-actions {
			flex-direction: column;
		}
	}

	@media (max-width: 640px) {
		.read-only-notice {
			flex-direction: column;
		}
	}
</style>
