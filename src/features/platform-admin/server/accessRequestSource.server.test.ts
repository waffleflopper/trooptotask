import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createIdentityPlatformAccessRequestStore } from '$features/identity/index.server';
import { createPlatformAccessRequestAdministration } from './accessRequestAdministration.server';
const REQUEST = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REVIEWER = '33333333-3333-4333-8333-333333333333';
function makeStore(fetch: typeof globalThis.fetch) {
	return createIdentityPlatformAccessRequestStore(
		createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		})
	);
}
describe('Platform review source acknowledgments', () => {
	it('a mismatched approval acknowledgment cannot mint setup credentials or announce approval', async () => {
		const source = makeStore(async (input, init) => {
			const req = new Request(input, init);
			return Response.json(
				req.method === 'PATCH'
					? { id: OTHER }
					: [{ id: REQUEST, email: 'applicant@example.test', status: 'pending', setup_completed_at: null }]
			);
		});
		const createForAccessRequest = vi.fn();
		const audit = vi.fn();
		const administration = createPlatformAccessRequestAdministration({
			store: { ...source, listAccessRequests: async () => [] },
			setupLinks: { createForAccessRequest },
			setupDelivery: { send: vi.fn() },
			sensitiveActionAuthorizer: {
				authorize: vi.fn().mockResolvedValue({
					allowed: true,
					action: 'platform.accessRequest.approve',
					reason: 'allowed.recentSession',
					actorUserId: REVIEWER,
					currentAssuranceLevel: 'aal1',
					nextAssuranceLevel: 'aal1',
					sessionAgeMs: 1000,
					recentSessionWindowMs: 900000,
					requiresStepUp: false
				})
			},
			checkSetupRateLimit: async () => ({ limited: false, action: 'approval', checks: [] }),
			audit,
			notifyGovernors: { notifyInvitationBlocked: async () => {} }
		});
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(
				administration.approve({
					accessRequestId: REQUEST,
					actorUserId: REVIEWER,
					publicOrigin: 'https://app.example.test'
				})
			).resolves.toEqual({ status: 'failed' });
			expect(createForAccessRequest).not.toHaveBeenCalled();
			expect(audit).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
});
