import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './publicRoutes';

describe('isPublicRoute', () => {
	it('allows unauthenticated auth bootstrap routes', () => {
		expect(isPublicRoute('/api/auth/establish-session')).toBe(true);
		expect(isPublicRoute('/api/auth/update-password')).toBe(true);
		expect(isPublicRoute('/api/auth/mfa/verify')).toBe(true);
	});

	it('allows the existing public site and auth routes', () => {
		expect(isPublicRoute('/')).toBe(true);
		expect(isPublicRoute('/auth/login')).toBe(true);
		expect(isPublicRoute('/security')).toBe(true);
	});

	it('keeps protected application routes private', () => {
		expect(isPublicRoute('/api/admin/users')).toBe(false);
		expect(isPublicRoute('/org/test-org/settings')).toBe(false);
	});
});
