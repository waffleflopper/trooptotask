import { describe, expect, it, vi } from 'vitest';
import { findInvitationRecipientAccount, normalizeUserEmailIdentity } from './invitationRecipientAccount.server';

function makeClient(
	identity: { user_id: string; normalized_email: string } | null,
	user: { confirmed_at?: string | null; email_confirmed_at?: string | null } | null,
	options: { identityError?: unknown; authError?: unknown } = {}
) {
	const maybeSingle = vi.fn().mockResolvedValue({ data: identity, error: options.identityError ?? null });
	const query = {
		select: vi.fn(),
		eq: vi.fn(),
		maybeSingle
	};
	query.select.mockReturnValue(query);
	query.eq.mockReturnValue(query);
	const from = vi.fn().mockReturnValue(query);
	const getUserById = vi.fn().mockResolvedValue({ data: { user }, error: options.authError ?? null });

	return {
		client: { from, auth: { admin: { getUserById } } },
		from,
		query,
		getUserById
	};
}

describe('invitation recipient account facts', () => {
	it.each([
		{ user: { email_confirmed_at: '2026-01-01T00:00:00Z' }, confirmed: true },
		{ user: { confirmed_at: '2026-01-01T00:00:00Z' }, confirmed: true },
		{ user: { email_confirmed_at: '  ', confirmed_at: null }, confirmed: false },
		{ user: null, confirmed: false }
	])('returns only indexed account facts with confirmation $confirmed', async ({ user, confirmed }) => {
		const { client, query, getUserById } = makeClient(
			{ user_id: 'user-1', normalized_email: 'soldier@example.mil' },
			user
		);

		await expect(findInvitationRecipientAccount(client as never, ' Soldier@Example.MIL ')).resolves.toEqual({
			id: 'user-1',
			email: 'soldier@example.mil',
			emailConfirmed: confirmed
		});
		expect(query.eq).toHaveBeenCalledWith('normalized_email', 'soldier@example.mil');
		expect(getUserById).toHaveBeenCalledWith('user-1');
	});

	it('returns no account without asking Auth when no indexed email identity exists', async () => {
		const { client, getUserById } = makeClient(null, null);

		await expect(findInvitationRecipientAccount(client as never, 'missing@example.mil')).resolves.toBeNull();
		expect(getUserById).not.toHaveBeenCalled();
	});

	it.each(['identity', 'auth'])('propagates a %s provider error', async (source) => {
		const failure = new Error(`${source} unavailable`);
		const { client } = makeClient({ user_id: 'user-1', normalized_email: 'soldier@example.mil' }, null, {
			identityError: source === 'identity' ? failure : undefined,
			authError: source === 'auth' ? failure : undefined
		});

		await expect(findInvitationRecipientAccount(client as never, 'soldier@example.mil')).rejects.toBe(failure);
	});

	it('exposes the same normalized User Account email used by Identity setup', () => {
		expect(normalizeUserEmailIdentity(' Soldier@Example.MIL ')).toBe('soldier@example.mil');
	});
});
