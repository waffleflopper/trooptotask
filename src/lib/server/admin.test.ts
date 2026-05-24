import { describe, expect, it } from 'vitest';
import { canAccessPage, getAccessiblePages } from './admin';

describe('admin page access', () => {
	it('allows billing admins to inspect billing event diagnostics', () => {
		expect(canAccessPage('billing', 'billing-events')).toBe(true);
		expect(getAccessiblePages('billing')).toContain('billing-events');
	});

	it('does not expose billing event diagnostics to support-only admins', () => {
		expect(canAccessPage('support', 'billing-events')).toBe(false);
	});

	it('allows support admins to inspect subscription support diagnostics', () => {
		expect(canAccessPage('support', 'subscriptions')).toBe(true);
		expect(getAccessiblePages('support')).toContain('subscriptions');
	});
});
