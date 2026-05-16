import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auto-accept-org-invites', () => ({
	autoAcceptOrgInvites: vi.fn().mockResolvedValue({ accepted: 1 })
}));

vi.mock('$lib/server/userProfile', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/userProfile')>();
	return {
		...actual,
		upsertUserProfile: vi.fn().mockResolvedValue(undefined)
	};
});

import { autoAcceptOrgInvites } from '$lib/server/auto-accept-org-invites';
import { upsertUserProfile } from '$lib/server/userProfile';
import { actions } from './+page.server';

function makeRegistrationRequest() {
	const formData = new FormData();
	formData.set('inviteCode', 'invite-123');
	formData.set('email', 'person@example.com');
	formData.set('password', 'ValidPassword123!');
	formData.set('confirmPassword', 'ValidPassword123!');
	formData.set('firstName', 'Jane');
	formData.set('lastName', 'Smith');
	formData.set('rank', 'SGT');

	return {
		formData: vi.fn().mockResolvedValue(formData)
	};
}

function makeSupabase(session: unknown) {
	const single = vi.fn().mockResolvedValue({
		data: {
			code: 'invite-123',
			email: 'person@example.com',
			expires_at: new Date(Date.now() + 86_400_000).toISOString()
		},
		error: null
	});
	const inviteRead = {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		is: vi.fn().mockReturnThis(),
		single
	};
	const inviteUpdate = {
		update: vi.fn().mockReturnThis(),
		eq: vi.fn().mockResolvedValue({ error: null })
	};
	const from = vi.fn().mockImplementation(() => {
		if (from.mock.calls.length === 1) return inviteRead;
		return inviteUpdate;
	});
	const signUp = vi.fn().mockResolvedValue({
		data: {
			user: { id: 'user-123' },
			session
		},
		error: null
	});

	return {
		auth: { signUp },
		from,
		inviteUpdate
	};
}

describe('register action', () => {
	it('stores profile metadata but waits for a confirmed session before writing user_profiles', async () => {
		const supabase = makeSupabase(null);

		const result = await actions.default({
			request: makeRegistrationRequest(),
			locals: { supabase }
		} as unknown as Parameters<(typeof actions)['default']>[0]);

		expect(supabase.auth.signUp).toHaveBeenCalledWith({
			email: 'person@example.com',
			password: 'ValidPassword123!',
			options: {
				data: {
					firstName: 'Jane',
					lastName: 'Smith',
					rank: 'SGT'
				}
			}
		});
		expect(upsertUserProfile).not.toHaveBeenCalled();
		expect(autoAcceptOrgInvites).not.toHaveBeenCalled();
		expect(supabase.inviteUpdate.update).toHaveBeenCalledWith({
			used_by: 'user-123',
			used_at: expect.any(String)
		});
		expect(result).toEqual({ success: true, confirmEmail: true, email: 'person@example.com' });
	});
});
