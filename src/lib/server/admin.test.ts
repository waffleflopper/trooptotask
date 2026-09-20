import { describe, expect, it } from 'vitest';
import { canAccessPage, getAccessiblePages } from './admin';

describe('admin page access', () => {
	it.each(['super_admin', 'support', 'billing'] as const)('does not grant retired gifting access to %s', (role) => {
		expect(canAccessPage(role, 'gifting')).toBe(false);
		expect(getAccessiblePages(role)).not.toContain('gifting');
	});
	it('allows support admins to inspect subscription support diagnostics', () => {
		expect(canAccessPage('support', 'subscriptions')).toBe(true);
		expect(getAccessiblePages('support')).toContain('subscriptions');
	});
});
