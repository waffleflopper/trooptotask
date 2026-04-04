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
			error: { message: 'Session is missing or invalid.' }
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
		expect(await response.json()).toEqual({
			error: 'Session is missing or invalid.'
		});
	});
});
