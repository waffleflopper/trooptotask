// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const baseData = {
	orgId: 'org-1',
	orgName: 'Test Org',
	canManageSubscription: true,
	effectiveTier: {
		tier: 'team',
		source: 'subscription',
		personnelCount: 12,
		personnelCap: 75,
		isReadOnly: false,
		giftExpiresAt: null,
		giftTier: null
	},
	tierComparison: [
		{
			tier: 'free',
			name: 'Free',
			personnelCap: 15,
			maxOrgsOwned: 1,
			bulkExportsPerMonth: 1,
			priceMonthly: 0
		},
		{
			tier: 'team',
			name: 'Team',
			personnelCap: 75,
			maxOrgsOwned: 3,
			bulkExportsPerMonth: 10,
			priceMonthly: 2900
		},
		{
			tier: 'unit',
			name: 'Unit',
			personnelCap: null,
			maxOrgsOwned: null,
			bulkExportsPerMonth: null,
			priceMonthly: 7900
		}
	]
};

describe('billing page toolbar', () => {
	it('exposes subscription controls as a named toolbar action group', () => {
		render(Page, {
			props: {
				data: baseData as never
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Billing controls' });
		const actions = within(toolbar).getByRole('group', { name: 'Billing actions' });

		expect(within(actions).getByRole('button', { name: 'Cancel Subscription' })).toBeTruthy();
		expect(within(actions).getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
	});

	it('keeps subscription controls hidden when subscription management is not allowed', () => {
		render(Page, {
			props: {
				data: { ...baseData, canManageSubscription: false } as never
			}
		});

		expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
	});

	it('keeps subscription actions disabled while requests are in flight', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true)
		);

		render(Page, {
			props: {
				data: baseData as never
			}
		});

		const actions = within(screen.getByRole('toolbar', { name: 'Billing controls' })).getByRole('group', {
			name: 'Billing actions'
		});

		await fireEvent.click(within(actions).getByRole('button', { name: 'Manage Subscription' }));
		expect((within(actions).getByRole('button', { name: 'Opening...' }) as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.click(within(actions).getByRole('button', { name: 'Cancel Subscription' }));
		expect((within(actions).getByRole('button', { name: 'Canceling...' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
