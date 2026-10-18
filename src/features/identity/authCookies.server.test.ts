import { describe, expect, it, vi } from 'vitest';
import { createAuthCookieWriter, getAuthCookieOptions } from './authCookies.server';

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

describe('createAuthCookieWriter', () => {
	it('writes cookies with forced options until the response is generated, then drops them with one warning', () => {
		const set = vi.fn();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const writer = createAuthCookieWriter({ set });
		const renewed = [{ name: 'sb-x-auth-token', value: 'secret-token-value', options: { maxAge: 3600 } }];

		writer.setAll(renewed);
		expect(set).toHaveBeenCalledExactlyOnceWith('sb-x-auth-token', 'secret-token-value', {
			maxAge: 3600,
			path: '/',
			httpOnly: true
		});
		expect(warn).not.toHaveBeenCalled();

		writer.markResponseGenerated();
		writer.setAll(renewed);
		expect(set).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledExactlyOnceWith('[auth-session]', {
			event: 'cookies_dropped_after_response',
			count: 1
		});
		warn.mockRestore();
	});
});
