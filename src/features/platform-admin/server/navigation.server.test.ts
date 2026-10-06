import { describe, expect, it } from 'vitest';
import { getAccessiblePlatformPages } from './navigation.server';

const pages = ['dashboard', 'users', 'organizations', 'access-requests', 'feedback', 'audit', 'announcements'];

describe('Platform page navigation', () => {
	it('offers every retained page to super-admins', () => {
		expect(getAccessiblePlatformPages('super_admin')).toEqual(pages);
	});
	it('offers support review pages without system management', () => {
		expect(getAccessiblePlatformPages('support')).toEqual([
			'dashboard',
			'users',
			'organizations',
			'access-requests',
			'feedback'
		]);
	});
	it('offers only the Dashboard to billing administrators', () => {
		expect(getAccessiblePlatformPages('billing')).toEqual(['dashboard']);
	});
	it.each(['super_admin', 'support', 'billing'] as const)('never offers retired commercial pages to %s', (role) => {
		for (const page of ['gifting', 'subscriptions', 'billing-events'])
			expect(getAccessiblePlatformPages(role)).not.toContain(page);
	});
});
