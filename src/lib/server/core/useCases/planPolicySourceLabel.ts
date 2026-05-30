import type { PlanPolicySource } from './planPolicy';

export function planPolicySourceLabel(source: PlanPolicySource): string {
	switch (source) {
		case 'admin_gift':
			return 'Admin gift';
		case 'billing_disabled_fallback':
			return 'Billing-disabled fallback';
		case 'billing_snapshot':
			return 'Stripe-backed billing';
		case 'legacy_organization':
			return 'Legacy organization';
	}
}
