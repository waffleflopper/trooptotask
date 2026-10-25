import { createClient } from '@supabase/supabase-js';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

import { loadPlatformAdminNavigation } from './navigation.server';

const actorId = '11111111-1111-4111-8111-111111111111';

function event(user: { id: string; email: string } | null) {
	return {
		locals: {
			actor: { userId: actorId },
			user,
			supabase: {
				auth: {
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({
							data: { currentLevel: 'aal2', nextLevel: 'aal2' },
							error: null
						})
					}
				}
			}
		},
		url: new URL('/admin', 'http://localhost'),
		depends: () => {},
		request: new Request('http://localhost/admin'),
		getClientAddress: () => '127.0.0.1'
	} as unknown as ServerLoadEvent;
}

describe('Platform operator navigation', () => {
	beforeEach(() => {
		getAdminClient.mockReturnValue(
			createClient('http://localhost:9', 'synthetic-service-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: { fetch: async () => Response.json({ user_id: actorId }) }
			})
		);
	});

	it('admits an operator and shows their email', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const navigation = await loadPlatformAdminNavigation(event({ id: actorId, email: 'operator@example.test' }));

		expect(navigation).toMatchObject({ adminUserId: actorId, adminEmail: 'operator@example.test' });
		await navigation.inboxOpenCount;
	});

	it('does not show an email that belongs to a different user', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const navigation = await loadPlatformAdminNavigation(event({ id: 'someone-else', email: 'other@example.test' }));
		expect(navigation.adminEmail).toBeUndefined();
		await navigation.inboxOpenCount;
	});
});
