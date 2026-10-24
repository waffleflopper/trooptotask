import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readIdentityAdmission } from './admission.server';
import { isPublicRoute } from './publicRoutes.server';

function admitAnonymous(pathname: string) {
	return readIdentityAdmission({
		supabase: createClient('http://localhost:9', 'synthetic-anonymous-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async () => {
					throw new Error('Anonymous cron admission must not query user identity');
				}
			}
		}),
		session: null,
		user: null,
		cookies: { get: () => undefined, delete: () => {} },
		pathname,
		method: 'GET'
	});
}

describe('isPublicRoute', () => {
	it('allows unauthenticated auth bootstrap routes', () => {
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

	it.each([
		'/api/cleanup-old-data',
		'/api/cleanup-archived-records',
		'/api/cleanup-expired-onboardings',
		'/api/cleanup-account-setup-links'
	])('lets %s reach its own secret check without opening nested routes', async (path) => {
		await expect(admitAnonymous(path)).resolves.toEqual({
			status: 'allowed',
			actor: null,
			mfaPending: false,
			hasTwoFactor: null,
			authFlow: null
		});
		await expect(admitAnonymous(path + '/other')).resolves.toEqual({
			status: 'redirect',
			code: 303,
			location: '/auth/login'
		});
	});

	it.each(['/api/cleanup-archived-personnel', '/api/admin/users', '/dashboard', '/org/test-org/settings'])(
		'keeps anonymous requests to %s behind sign-in',
		async (pathname) => {
			await expect(admitAnonymous(pathname)).resolves.toEqual({
				status: 'redirect',
				code: 303,
				location: '/auth/login'
			});
		}
	);

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
