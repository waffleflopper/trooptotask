<script lang="ts">
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { isBillingEnabled } from '$lib/config/billing';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';

	let { orgId }: { orgId: string } = $props();

	const daysRemaining = $derived(subscriptionStore.giftDaysRemaining);
	const showGiftWarning = $derived(subscriptionStore.isGifted && daysRemaining !== null && daysRemaining <= 14);
	const isUrgent = $derived(daysRemaining !== null && daysRemaining <= 3);
	const isReadOnly = $derived(subscriptionStore.isReadOnly);
	const showBanner = $derived(isBillingEnabled && (showGiftWarning || isReadOnly));

	const tierName = $derived(subscriptionStore.tierConfig.name);
	const personnelCap = $derived(subscriptionStore.personnelCap);
	const personnelCount = $derived(subscriptionStore.personnelCount);

	/** Offset for demo banner if it's visible */
	const demoBannerOffset = $derived(demoModeStore.hasBanner ? 40 : 0);
</script>

{#if showBanner}
	<div
		class="subscription-banner"
		class:urgent={isUrgent || isReadOnly}
		style:top="calc(var(--header-height, 56px) + {demoBannerOffset}px)"
	>
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
				<a href="/org/{orgId}/billing" class="banner-btn">Subscribe</a>
				<a href="/org/{orgId}/personnel" class="banner-btn">Manage Personnel</a>
				<a href="/org/{orgId}/settings" class="banner-btn">Export Data</a>
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
				<a href="/org/{orgId}/billing" class="banner-btn">Subscribe</a>
			{/if}
		</div>
	</div>
{/if}

<style>
	.subscription-banner {
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: white;
		padding: var(--spacing-sm) var(--spacing-lg);
		position: fixed;
		left: 0;
		width: 100%;
		z-index: 99;
		box-sizing: border-box;
	}

	.subscription-banner.urgent {
		background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
	}

	.banner-content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		max-width: 1200px;
		margin: 0 auto;
	}

	.banner-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.banner-icon svg {
		width: 20px;
		height: 20px;
	}

	.banner-text {
		font-size: var(--font-size-sm);
	}

	.banner-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: var(--radius-md);
		color: white;
		font-size: var(--font-size-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		text-decoration: none;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.banner-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	@media (max-width: 640px) {
		.banner-content {
			flex-wrap: wrap;
			text-align: center;
		}

		.banner-text {
			width: 100%;
		}
	}
</style>
