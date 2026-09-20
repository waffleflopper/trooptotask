import { describe, expect, it } from 'vitest';
import { canAccessPage, getAccessiblePages } from './admin';

describe('admin page access', () => {
	it('allows support admins to inspect subscription support diagnostics', () => {
		expect(canAccessPage('support', 'subscriptions')).toBe(true);
		expect(getAccessiblePages('support')).toContain('subscriptions');
	});
});
