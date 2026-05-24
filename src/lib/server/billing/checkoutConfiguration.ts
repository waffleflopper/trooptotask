import { env } from '$env/dynamic/private';

export type BillingAddressCollection = 'auto' | 'required';
export type CheckoutCustomerUpdateMode = 'auto' | 'never';

export interface CheckoutSessionConfiguration {
	billingAddressCollection: BillingAddressCollection;
	automaticTax: {
		enabled: boolean;
	};
	customerUpdate: {
		address: CheckoutCustomerUpdateMode;
		name: CheckoutCustomerUpdateMode;
	};
}

export interface CheckoutConfigurationEnv {
	STRIPE_AUTOMATIC_TAX_ENABLED?: string;
	STRIPE_TAX_DASHBOARD_VERIFIED?: string;
}

export const TAX_DISABLED_CHECKOUT_SESSION_CONFIGURATION: CheckoutSessionConfiguration = {
	billingAddressCollection: 'auto',
	automaticTax: {
		enabled: false
	},
	customerUpdate: {
		address: 'auto',
		name: 'auto'
	}
};

export class CheckoutConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CheckoutConfigurationError';
	}
}

function parseOptionalBoolean(name: keyof CheckoutConfigurationEnv, value: string | undefined): boolean | null {
	if (value === undefined || value.trim() === '') return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	throw new CheckoutConfigurationError(`${name} must be true or false`);
}

export function resolveCheckoutSessionConfiguration(
	input: CheckoutConfigurationEnv = env as CheckoutConfigurationEnv
): CheckoutSessionConfiguration {
	const automaticTaxEnabled = parseOptionalBoolean('STRIPE_AUTOMATIC_TAX_ENABLED', input.STRIPE_AUTOMATIC_TAX_ENABLED);
	const taxDashboardVerified = parseOptionalBoolean(
		'STRIPE_TAX_DASHBOARD_VERIFIED',
		input.STRIPE_TAX_DASHBOARD_VERIFIED
	);

	if (automaticTaxEnabled && taxDashboardVerified !== true) {
		throw new CheckoutConfigurationError(
			'Automatic tax is enabled, but Stripe Tax dashboard setup has not been marked verified'
		);
	}

	return {
		billingAddressCollection: automaticTaxEnabled ? 'required' : 'auto',
		automaticTax: {
			enabled: automaticTaxEnabled === true
		},
		customerUpdate: {
			address: 'auto',
			name: 'auto'
		}
	};
}
