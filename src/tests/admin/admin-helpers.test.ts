import { describe, it, expect } from 'vitest';
import { canAccessPage, getAccessiblePages } from '$lib/server/admin';

describe('canAccessPage', () => {
	it('super_admin can access all pages', () => {
		const pages = ['dashboard', 'users', 'organizations', 'access-requests', 'feedback', 'audit', 'announcements'];
		for (const page of pages) {
			expect(canAccessPage('super_admin', page)).toBe(true);
		}
	});

	it('support can access support pages and dashboard', () => {
		expect(canAccessPage('support', 'dashboard')).toBe(true);
		expect(canAccessPage('support', 'users')).toBe(true);
		expect(canAccessPage('support', 'organizations')).toBe(true);
		expect(canAccessPage('support', 'access-requests')).toBe(true);
		expect(canAccessPage('support', 'feedback')).toBe(true);
	});

	it('support cannot access system pages', () => {
		expect(canAccessPage('support', 'audit')).toBe(false);
		expect(canAccessPage('support', 'announcements')).toBe(false);
	});

	it('billing retains dashboard access', () => {
		expect(canAccessPage('billing', 'dashboard')).toBe(true);
	});

	it('billing cannot access support or system pages', () => {
		expect(canAccessPage('billing', 'users')).toBe(false);
		expect(canAccessPage('billing', 'organizations')).toBe(false);
		expect(canAccessPage('billing', 'access-requests')).toBe(false);
		expect(canAccessPage('billing', 'feedback')).toBe(false);
		expect(canAccessPage('billing', 'audit')).toBe(false);
		expect(canAccessPage('billing', 'announcements')).toBe(false);
	});

	it('returns false for unknown page', () => {
		expect(canAccessPage('super_admin', 'unknown-page')).toBe(false);
	});
});

describe('getAccessiblePages', () => {
	it('lists support navigation', () => {
		const pages = getAccessiblePages('support');
		expect(pages).toContain('dashboard');
		expect(pages).toContain('users');
	});

	it('restricts billing navigation to its permitted pages', () => {
		const pages = getAccessiblePages('billing');
		expect(pages).toContain('dashboard');
		expect(pages).not.toContain('users');
	});
});
