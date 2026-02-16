<script lang="ts">
	import { subscriptionStore } from '../stores/subscription.svelte';

	const isPastDue = $derived(subscriptionStore.limits.isPastDue);

	async function openBillingPortal() {
		const portalUrl = await subscriptionStore.createPortalSession();
		if (portalUrl) {
			window.location.href = portalUrl;
		}
	}
</script>

{#if isPastDue}
	<div class="past-due-banner" role="alert">
		<div class="banner-content">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
				<line x1="12" y1="9" x2="12" y2="13"></line>
				<line x1="12" y1="17" x2="12.01" y2="17"></line>
			</svg>
			<div class="text">
				<strong>Payment Failed</strong>
				<span class="message">Your subscription payment failed. Please update your payment method to avoid service interruption.</span>
			</div>
		</div>
		<button class="update-button" onclick={openBillingPortal}>
			Update Payment
		</button>
	</div>
{/if}

<style>
	.past-due-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-error-bg, #fef2f2);
		border-bottom: 1px solid var(--color-error-border, #fecaca);
		color: var(--color-error-text, #991b1b);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.banner-content svg {
		flex-shrink: 0;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.text strong {
		font-weight: 600;
	}

	.message {
		font-size: var(--font-size-sm);
		opacity: 0.9;
	}

	.update-button {
		flex-shrink: 0;
		padding: var(--spacing-xs) var(--spacing-md);
		background: var(--color-error, #ef4444);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background 0.15s;
	}

	.update-button:hover {
		background: var(--color-error-hover, #dc2626);
	}

	@media (max-width: 640px) {
		.past-due-banner {
			flex-direction: column;
			align-items: flex-start;
		}

		.update-button {
			width: 100%;
		}
	}
</style>
