<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { isBillingEnabled } from '$lib/config/billing';
	let { orgId }: { orgId: string } = $props();

	const daysRemaining = $derived(subscriptionStore.giftDaysRemaining);
	const showGiftWarning = $derived(subscriptionStore.isGifted && daysRemaining !== null && daysRemaining <= 14);
	const isUrgent = $derived(daysRemaining !== null && daysRemaining <= 3);
	const isReadOnly = $derived(subscriptionStore.isReadOnly);
	const showBanner = $derived(isBillingEnabled && (showGiftWarning || isReadOnly));

	const tierName = $derived(subscriptionStore.tierConfig.name);
	const personnelCap = $derived(subscriptionStore.personnelCap);
	const personnelCount = $derived(subscriptionStore.personnelCount);
</script>

{#if showBanner}
	<div class="subscription-banner" class:urgent={isUrgent || isReadOnly}>
		<div class="banner-content">
			{#if isReadOnly}
				<span class="banner-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
					</svg>
				</span>
				<span class="banner-text">
					Your org has <strong>{personnelCount}</strong> personnel but your current plan allows
					<strong>{personnelCap === Infinity ? 'unlimited' : personnelCap}</strong>. Your data is read-only.
				</span>
				<div class="banner-actions">
					<a href="/org/{orgId}/billing" class="banner-btn">Subscribe</a>
					<a href="/org/{orgId}/personnel" class="banner-btn">Manage Personnel</a>
					<a href="/org/{orgId}/settings" class="banner-btn">Export Data</a>
				</div>
			{:else if showGiftWarning}
				<span class="banner-icon">
					{#if isUrgent}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<polyline points="12 6 12 12 16 14" />
						</svg>
					{/if}
				</span>
				<span class="banner-text">
					{#if isUrgent}
						Your complimentary <strong>{tierName}</strong> plan expires in
						<strong>{daysRemaining}</strong>
						{daysRemaining === 1 ? 'day' : 'days'}. Subscribe now to maintain full access.
					{:else}
						Your complimentary <strong>{tierName}</strong> plan expires in
						<strong>{daysRemaining}</strong>
						{daysRemaining === 1 ? 'day' : 'days'}. Set up a subscription to keep your data.
					{/if}
				</span>
				<div class="banner-actions">
					<a href="/org/{orgId}/billing" class="banner-btn">Subscribe</a>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.subscription-banner {
		background: color-mix(in srgb, var(--amber-light) 82%, var(--surface-panel));
		color: var(--text-primary);
		padding: 0;
		width: 100%;
		box-sizing: border-box;
		border-bottom: 1px solid var(--border-default);
	}

	.subscription-banner.urgent {
		background: color-mix(in srgb, var(--danger-bg) 74%, var(--surface-panel));
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		max-width: 1680px;
		margin: 0 auto;
		padding: 0.75rem clamp(var(--sp-4), 2vw, var(--sp-6));
	}

	.banner-content::before {
		content: '';
		width: 3px;
		align-self: stretch;
		border-radius: 999px;
		background: var(--amber);
		flex-shrink: 0;
	}

	.subscription-banner.urgent .banner-content::before {
		background: var(--danger);
	}

	.banner-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: inherit;
	}

	.banner-icon svg {
		width: 18px;
		height: 18px;
	}

	.banner-text {
		flex: 1;
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.banner-text strong {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.banner-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		padding: 0.45rem 0.75rem;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast),
			color var(--transition-fast);
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.banner-btn:hover {
		border-color: rgba(var(--amber-rgb), 0.4);
		color: var(--amber-dark);
	}

	.banner-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	@media (max-width: 640px) {
		.banner-content {
			flex-wrap: wrap;
			align-items: flex-start;
		}

		.banner-text {
			width: 100%;
		}
	}
</style>
