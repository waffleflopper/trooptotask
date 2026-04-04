import { describe, expect, it } from 'vitest';
import { getAuthCookieOptions } from './authCookies';

describe('getAuthCookieOptions', () => {
	it('forces auth cookies to be HttpOnly and rooted at /', () => {
		expect(
			getAuthCookieOptions({
				path: '/auth',
				secure: true,
				sameSite: 'strict',
				httpOnly: false,
				maxAge: 3600
			})
		).toEqual({
			path: '/',
			secure: true,
			sameSite: 'strict',
			httpOnly: true,
			maxAge: 3600
		});
	});
});
