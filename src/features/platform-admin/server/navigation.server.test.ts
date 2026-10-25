import { createClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
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
		request: new Request('http://localhost/admin'),
		getClientAddress: () => '127.0.0.1'
	} as unknown as RequestEvent;
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
		await expect(loadPlatformAdminNavigation(event({ id: actorId, email: 'operator@example.test' }))).resolves.toEqual({
			adminUserId: actorId,
			adminEmail: 'operator@example.test'
		});
	});

	it('does not show an email that belongs to a different user', async () => {
		const navigation = await loadPlatformAdminNavigation(event({ id: 'someone-else', email: 'other@example.test' }));
		expect(navigation.adminEmail).toBeUndefined();
	});
});
