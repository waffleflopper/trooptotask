import { describe, expect, it } from 'vitest';
import { adminBadgeVariant } from './adminTheme';

describe('adminBadgeVariant', () => {
	it('maps billing health states to severity variants', () => {
		expect(adminBadgeVariant('healthy')).toBe('success');
		expect(adminBadgeVariant('permanent_failure')).toBe('danger');
		expect(adminBadgeVariant('diagnostics_unavailable')).toBe('danger');
		expect(adminBadgeVariant('needs_retry')).toBe('warning');
		expect(adminBadgeVariant('drift_detected')).toBe('warning');
		expect(adminBadgeVariant('payment_recovery_attention')).toBe('warning');
		expect(adminBadgeVariant('reconciliation_stale')).toBe('warning');
	});
});
