import type { PlatformBillingHealthSummary } from './platformBillingHealth';

export function degradedBillingHealthSummary(now = new Date()): PlatformBillingHealthSummary {
	return {
		generatedAt: now.toISOString(),
		overallState: 'diagnostics_unavailable',
		states: ['diagnostics_unavailable'],
		counts: {
			retryableFailures: 0,
			permanentFailures: 0,
			staleFailedEvents: 0,
			recentPaymentFailures: 0,
			driftedOrganizations: 0,
			staleReconciliation: 0,
			supportAttentionItems: 0
		},
		issues: [],
		diagnosticsError: true
	};
}
