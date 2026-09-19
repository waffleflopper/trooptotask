// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import SubscriptionBanner from './SubscriptionBanner.svelte';
import { subscriptionStore } from '$lib/stores/subscription.svelte';
import type { EffectiveTier } from '$lib/types/subscription';

// These cases exercise enabled billing, independently of local or CI configuration.
vi.mock('$lib/config/billing', () => ({ isBillingEnabled: true }));

const baseTier: EffectiveTier = {
	tier: 'team',
	source: 'subscription',
	personnelCount: 21,
	personnelCap: 80,
	isReadOnly: true,
	readOnlyReason: 'billing_state',
	giftExpiresAt: null,
	giftTier: null
};

afterEach(() => {
	cleanup();
	subscriptionStore.clear();
});

describe('SubscriptionBanner', () => {
	it('uses billing-state copy instead of personnel-limit copy for payment recovery blocks', () => {
		subscriptionStore.load(baseTier);

		render(SubscriptionBanner, { props: { orgId: 'org-1' } });

		expect(screen.getByText(/Billing is not currently active/)).toBeTruthy();
		expect(screen.getByText(/Existing data remains visible/)).toBeTruthy();
		expect(screen.queryByText(/Your org has/)).toBeNull();
	});

	it('uses payment-failure copy instead of personnel-limit copy for failed renewals', () => {
		subscriptionStore.load({
			...baseTier,
			readOnlyReason: 'payment_failure'
		});

		render(SubscriptionBanner, { props: { orgId: 'org-1' } });

		expect(screen.getByText(/A renewal payment needs attention/)).toBeTruthy();
		expect(screen.getByText(/Existing data remains visible/)).toBeTruthy();
		expect(screen.queryByText(/Your org has/)).toBeNull();
	});

	it('keeps personnel-limit copy when the org is actually over the personnel cap', () => {
		subscriptionStore.load({
			...baseTier,
			personnelCap: 20,
			readOnlyReason: 'personnel_limit'
		});

		render(SubscriptionBanner, { props: { orgId: 'org-1' } });

		expect(screen.getByText(/Your org has/)).toBeTruthy();
		expect(screen.getByText('21')).toBeTruthy();
		expect(screen.getByText('20')).toBeTruthy();
	});
});
