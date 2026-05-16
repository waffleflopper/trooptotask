import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auto-accept-org-invites', () => ({
	autoAcceptOrgInvites: vi.fn().mockResolvedValue({ accepted: 2 })
}));

vi.mock('$lib/server/accessRequestAuth', () => ({
	markApprovedAccessRequestCompleted: vi.fn().mockResolvedValue({ updated: 1 })
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: vi.fn().mockReturnValue({})
}));

vi.mock('$lib/server/userProfile', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/userProfile')>();
	return {
		...actual,
		upsertCurrentUserProfile: vi.fn().mockResolvedValue(undefined)
	};
});

import { upsertCurrentUserProfile } from '$lib/server/userProfile';
import { POST } from './+server';

describe('POST /api/auth/finalize-invite', () => {
	afterEach(() => {
		vi.mocked(upsertCurrentUserProfile).mockClear();
	});

	it('finalizes the invite and clears the pending invite flow marker', async () => {
		const cookies = { delete: vi.fn() };

		const response = await POST({
			locals: {
				user: {
					id: 'user-123',
					email: 'person@example.com',
					user_metadata: {
						firstName: 'Jane',
						lastName: 'Smith',
						rank: 'SGT'
					}
				},
				supabase: {}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, accepted: 2, completed: 1 });
		expect(upsertCurrentUserProfile).toHaveBeenCalledWith(expect.any(Object), {
			firstName: 'Jane',
			lastName: 'Smith',
			rank: 'SGT'
		});
		expect(cookies.delete).toHaveBeenCalledWith('ttt_pending_auth_flow', { path: '/' });
	});

	it('rejects requests without an active invite session', async () => {
		const cookies = { delete: vi.fn() };

		const response = await POST({
			locals: {
				user: null,
				supabase: {}
			},
			cookies
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: 'Your invite session is no longer active. Please reopen the invite link and try again.',
			accepted: 0,
			completed: 0
		});
		expect(cookies.delete).not.toHaveBeenCalled();
	});
});
