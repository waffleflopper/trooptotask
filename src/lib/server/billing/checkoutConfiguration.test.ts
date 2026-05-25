import { describe, expect, it } from 'vitest';
import { CheckoutConfigurationError, resolveCheckoutSessionConfiguration } from './checkoutConfiguration';

describe('resolveCheckoutSessionConfiguration', () => {
	it('keeps tax-disabled checkout explicit by default', () => {
		expect(resolveCheckoutSessionConfiguration({})).toEqual({
			billingAddressCollection: 'auto',
			automaticTax: { enabled: false },
			customerUpdate: { address: 'auto', name: 'auto' }
		});
	});

	it('requires full billing details when automatic tax is enabled and dashboard setup is verified', () => {
		expect(
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'true',
				STRIPE_TAX_DASHBOARD_VERIFIED: 'true'
			})
		).toEqual({
			billingAddressCollection: 'required',
			automaticTax: { enabled: true },
			customerUpdate: { address: 'auto', name: 'auto' }
		});
	});

	it('fails closed when automatic tax is enabled without dashboard verification', () => {
		expect(() =>
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'true'
			})
		).toThrow(CheckoutConfigurationError);
		expect(() =>
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'true'
			})
		).toThrow('Stripe Tax dashboard setup has not been marked verified');
		expect(() =>
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'true',
				STRIPE_TAX_DASHBOARD_VERIFIED: 'false'
			})
		).toThrow(CheckoutConfigurationError);
	});

	it('rejects invalid boolean configuration values', () => {
		expect(() =>
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'yes',
				STRIPE_TAX_DASHBOARD_VERIFIED: 'true'
			})
		).toThrow('STRIPE_AUTOMATIC_TAX_ENABLED must be true or false');
		expect(() =>
			resolveCheckoutSessionConfiguration({
				STRIPE_AUTOMATIC_TAX_ENABLED: 'false',
				STRIPE_TAX_DASHBOARD_VERIFIED: '1'
			})
		).toThrow('STRIPE_TAX_DASHBOARD_VERIFIED must be true or false');
	});
});
