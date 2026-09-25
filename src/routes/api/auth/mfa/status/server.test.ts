import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

describe('GET /api/auth/mfa/status', () => {
	it('returns the current and next assurance levels for the active session', async () => {
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: {
				currentLevel: 'aal1',
				nextLevel: 'aal2'
			},
			error: null
		});

		const response = await GET({
			locals: {
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel
						}
					}
				}
			}
		} as unknown as Parameters<typeof GET>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			currentLevel: 'aal1',
			nextLevel: 'aal2'
		});
	});

	it('returns an auth error when assurance level lookup fails', async () => {
		const getAuthenticatorAssuranceLevel = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'Session is missing or invalid. refresh_token=private-status-secret' }
		});

		const response = await GET({
			locals: {
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel
						}
					}
				}
			}
		} as unknown as Parameters<typeof GET>[0]);

		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-status-secret');
	});
});

describe('assurance result boundary', () => {
	const event = (lookup: () => Promise<unknown>) =>
		({ locals: { supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: lookup } } } } }) as unknown as Parameters<
			typeof GET
		>[0];

	it.each([
		['password-only session', 'aal1', 'aal1'],
		['MFA still required', 'aal1', 'aal2'],
		['MFA completed', 'aal2', 'aal2'],
		['already elevated session without further step-up', 'aal2', 'aal1']
	])('reports %s without exposing provider session details', async (_, currentLevel, nextLevel) => {
		const response = await GET(
			event(async () => ({
				data: { currentLevel, nextLevel, currentAuthenticationMethods: [{ method: 'password', timestamp: 123 }] },
				error: null
			}))
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ currentLevel, nextLevel });
	});

	it.each([
		['missing result', undefined],
		['missing data', { error: null }],
		['null data', { data: null, error: null }],
		['no active assurance', { data: { currentLevel: null, nextLevel: null }, error: null }],
		['missing current level', { data: { nextLevel: 'aal2' }, error: null }],
		['missing next level', { data: { currentLevel: 'aal1' }, error: null }],
		['unknown current level', { data: { currentLevel: 'aal3', nextLevel: 'aal2' }, error: null }],
		['unknown next level', { data: { currentLevel: 'aal1', nextLevel: 'aal3' }, error: null }]
	])('rejects %s instead of reporting completed authentication', async (_, result) => {
		const response = await GET(event(async () => result));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expect.any(String) });
	});

	it('honors a provider error even alongside usable assurance data', async () => {
		const response = await GET(
			event(async () => ({
				data: { currentLevel: 'aal2', nextLevel: 'aal2' },
				error: { message: 'Session is invalid. access_token=private-status-secret' }
			}))
		);
		expect(response.status).toBe(401);
		const body = await response.json();
		expect(body).toEqual({ error: expect.any(String) });
		expect(JSON.stringify(body)).not.toContain('private-status-secret');
	});

	it('reports a thrown lookup as unavailable and allows a later successful request', async () => {
		let available = false;
		const request = event(async () => {
			if (!available) throw new Error('private provider details');
			return { data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null };
		});
		const failed = await GET(request);
		expect(failed.status).toBe(503);
		expect(await failed.json()).toEqual({ error: expect.not.stringContaining('private provider details') });
		available = true;
		const retry = await GET(request);
		expect(retry.status).toBe(200);
		expect(await retry.json()).toEqual({ currentLevel: 'aal1', nextLevel: 'aal2' });
	});
});
