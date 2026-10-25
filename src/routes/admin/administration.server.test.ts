import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
import { load } from './+layout.server';

const actorId = '11111111-1111-4111-8111-111111111111';
let operator: boolean;
let unavailable: boolean;
let currentLevel: 'aal1' | 'aal2';
let nextLevel: 'aal1' | 'aal2';
function event() {
	const url = new URL('/admin', 'http://localhost');
	return {
		locals: {
			actor: { userId: actorId },
			user: { id: actorId },
			supabase: {
				auth: {
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel, nextLevel }, error: null })
					}
				}
			}
		},
		url,
		request: new Request(url),
		getClientAddress: () => '127.0.0.1',
		depends: () => {}
	} as unknown as Parameters<typeof load>[0];
}
beforeEach(() => {
	operator = true;
	unavailable = false;
	currentLevel = 'aal2';
	nextLevel = 'aal2';
	getAdminClient.mockReturnValue(
		createClient('http://localhost:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async () =>
					unavailable
						? Response.json({ message: 'unavailable' }, { status: 400 })
						: Response.json(operator ? { user_id: actorId } : null)
			}
		})
	);
});
describe('operator page admission', () => {
	it('refuses a signed-in non-operator', async () => {
		operator = false;
		await expect(load(event())).rejects.toMatchObject({ status: 403 });
	});
	it.each(['aal1', 'aal2'] as const)(
		'redirects aal1 with next assurance %s to enrollment or challenge',
		async (next) => {
			currentLevel = 'aal1';
			nextLevel = next;
			await expect(load(event())).rejects.toMatchObject({
				status: 303,
				location: `${next === 'aal2' ? '/auth/mfa-verify' : '/auth/mfa-setup'}?next=%2Fadmin`
			});
		}
	);
	it('refuses a non-operator whose verified session is still awaiting MFA', async () => {
		operator = false;
		currentLevel = 'aal1';
		nextLevel = 'aal2';
		const request = event();
		request.locals.actor = null;
		request.locals.mfaPending = true;
		await expect(load(request)).rejects.toMatchObject({ status: 403 });
	});
	it('challenges an operator whose verified session is still awaiting MFA', async () => {
		currentLevel = 'aal1';
		nextLevel = 'aal2';
		const request = event();
		request.locals.actor = null;
		request.locals.mfaPending = true;
		await expect(load(request)).rejects.toMatchObject({ status: 303, location: '/auth/mfa-verify?next=%2Fadmin' });
	});
	it('admits an operator at aal2 to the admin shell', async () => {
		await expect(load(event())).resolves.toMatchObject({ adminUserId: actorId });
	});
	it('fails closed when operator membership is unavailable', async () => {
		unavailable = true;
		await expect(load(event())).rejects.toMatchObject({ status: 503 });
	});
});
