import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readIdentityAdmission } from './admission.server';

const userId = '11111111-1111-4111-8111-111111111111';
const claims = Buffer.from(
	JSON.stringify({ sub: userId, session_id: '22222222-2222-4222-8222-222222222222', amr: [{ method: 'password' }] })
).toString('base64url');
function admission(pathname: string) {
	return readIdentityAdmission({
		pathname,
		method: 'GET',
		cookies: { get: () => undefined, delete: () => {} },
		session: { access_token: `header.${claims}.signature`, user: { id: userId } } as Session,
		user: { id: userId, factors: [{ status: 'verified' }] } as User,
		supabase: {
			auth: {
				mfa: {
					getAuthenticatorAssuranceLevel: async () => ({
						data: { currentLevel: 'aal1', nextLevel: 'aal2' },
						error: null
					})
				}
			},
			rpc: async () => ({ data: false, error: null })
		} as unknown as SupabaseClient
	});
}
describe('pending MFA at the platform boundary', () => {
	it.each(['/admin', '/admin/api/suspend'])(
		'lets %s resolve operator membership without granting an application actor',
		async (pathname) => {
			await expect(admission(pathname)).resolves.toMatchObject({
				status: 'allowed',
				actor: null,
				mfaPending: true,
				authFlow: null
			});
		}
	);
	it('keeps ordinary application routes behind the MFA challenge', async () => {
		await expect(admission('/dashboard')).resolves.toEqual({
			status: 'redirect',
			code: 303,
			location: '/auth/mfa-verify'
		});
	});
});
