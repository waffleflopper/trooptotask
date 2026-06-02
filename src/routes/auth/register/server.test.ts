import { describe, expect, it } from 'vitest';
import { GET, POST } from './+server';

describe('legacy register route redirect', () => {
	it('redirects legacy invite-code URLs with an email to setup-link renewal', async () => {
		const response = await GET({
			url: new URL('http://localhost/auth/register?code=legacy-code&email=Person@Example.com')
		} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/auth/renew-invite?email=Person%40Example.com');
	});

	it('redirects register visits without an email to request access', async () => {
		const response = await GET({
			url: new URL('http://localhost/auth/register')
		} as Parameters<typeof GET>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/auth/request-access');
	});

	it('redirects legacy posts instead of accepting invite-code registration', async () => {
		const response = await POST({
			url: new URL('http://localhost/auth/register?email=Person@Example.com')
		} as Parameters<typeof POST>[0]);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/auth/renew-invite?email=Person%40Example.com');
	});
});
