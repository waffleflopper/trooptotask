import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './publicRoutes.server';

describe('isPublicRoute', () => {
	it('allows unauthenticated auth bootstrap routes', () => {
		expect(isPublicRoute('/api/auth/establish-session')).toBe(true);
		expect(isPublicRoute('/api/auth/mfa/status')).toBe(true);
		expect(isPublicRoute('/api/auth/update-password')).toBe(true);
		expect(isPublicRoute('/api/auth/mfa/verify')).toBe(true);
	});

	it('keeps privileged auth mutations behind an established session', () => {
		expect(isPublicRoute('/api/auth/finalize-invite')).toBe(false);
		expect(isPublicRoute('/api/auth/mfa/enroll')).toBe(false);
	});

	it('allows the existing public site and auth routes', () => {
		expect(isPublicRoute('/')).toBe(true);
		expect(isPublicRoute('/auth/login')).toBe(true);
		expect(isPublicRoute('/about')).toBe(true);
		expect(isPublicRoute('/security')).toBe(true);
	});

	it('lets the archive cron reach its own secret check without opening nested routes', () => {
		expect(isPublicRoute('/api/cleanup-archived-records')).toBe(true);
		expect(isPublicRoute('/api/cleanup-archived-records/other')).toBe(false);
	});

	it('does not classify the removed help route as public', () => {
		expect(isPublicRoute('/help')).toBe(false);
		expect(isPublicRoute('/help/platform-guide')).toBe(false);
	});

	it('keeps protected application routes private', () => {
		expect(isPublicRoute('/api/admin/users')).toBe(false);
		expect(isPublicRoute('/dashboard')).toBe(false);
		expect(isPublicRoute('/org/test-org/settings')).toBe(false);
	});

	it('does not grant anonymous access to retired scheduled billing paths', () => {
		expect(isPublicRoute('/api/billing-reconciliation')).toBe(false);
		expect(isPublicRoute('/api/billing-reconciliation/nested')).toBe(false);
	});

	it('does not grant anonymous access to retired webhook paths', () => {
		expect(isPublicRoute('/api/webhooks')).toBe(false);
		expect(isPublicRoute('/api/webhooks/stripe')).toBe(false);
		expect(isPublicRoute('/api/webhooks/stripe/nested')).toBe(false);
	});
});
