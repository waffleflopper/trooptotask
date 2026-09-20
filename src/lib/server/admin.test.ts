import { describe, expect, it } from 'vitest';
import { canAccessPage, getAccessiblePages } from './admin';

describe('admin page access', () => {
	it.each(['super_admin', 'support', 'billing'] as const)(
		'does not grant retired commercial page access to %s',
		(role) => {
			for (const page of ['gifting', 'subscriptions', 'billing-events']) {
				expect(canAccessPage(role, page)).toBe(false);
				expect(getAccessiblePages(role)).not.toContain(page);
			}
		}
	);
});
