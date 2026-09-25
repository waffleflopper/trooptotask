import { describe, expect, it, vi } from 'vitest';
const proof = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({
		auth: {
			signInWithPassword: proof.signIn,
			getUser: async () => ({ data: { user: { id: 'user-123' } }, error: null }),
			mfa: {
				getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
			},
			admin: { signOut: async () => ({ error: null }) },
			signOut: async () => ({ error: null })
		}
	})
}));
vi.mock('$lib/server/supabase', () => ({
	getAdminClient: () => ({ rpc: async () => ({ data: { limited: false, retry_after_ms: 0 }, error: null }) })
}));
import { actions, load } from './+page.server';

function makeActionEvent(input: {
	email?: string;
	currentPassword?: string;
	userEmail?: string | null;
	signInWithPassword?: typeof proof.signIn;
	updateUser?: typeof proof.signIn;
}) {
	proof.signIn = input.signInWithPassword ?? vi.fn().mockResolvedValue(validProof());
	const formData = new FormData();
	formData.set('email', input.email ?? 'new@example.test');
	if (input.currentPassword !== undefined) {
		formData.set('currentPassword', input.currentPassword);
	}

	return {
		request: new Request('http://localhost/account/security?/updateEmail', {
			method: 'POST',
			body: formData
		}),
		getClientAddress: () => '192.0.2.1',
		locals: {
			actor: { userId: 'user-123' },
			session: { user: { id: 'user-123' }, access_token: 'admitted', expires_at: 4102444800 },
			user: { id: 'user-123', email: input.userEmail ?? 'current@example.test' },
			supabase: {
				auth: {
					mfa: {
						getAuthenticatorAssuranceLevel: async () => ({
							data: { currentLevel: 'aal2', nextLevel: 'aal2' },
							error: null
						})
					},
					signInWithPassword: input.signInWithPassword ?? vi.fn().mockResolvedValue({ error: null }),
					updateUser: input.updateUser ?? vi.fn().mockResolvedValue({ error: null })
				}
			}
		}
	} as unknown as Parameters<(typeof actions)['updateEmail']>[0];
}

describe('POST /account/security?/updateEmail', () => {
	it('requires the current password before changing email', async () => {
		const signInWithPassword = vi.fn();
		const updateUser = vi.fn();

		const result = await actions.updateEmail(
			makeActionEvent({
				currentPassword: '',
				signInWithPassword,
				updateUser
			})
		);

		expect(result).toMatchObject({
			status: 400,
			data: {
				emailError: 'Enter your current password to change your email',
				email: 'new@example.test'
			}
		});
		expect(signInWithPassword).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('rejects email changes when current-password reauthentication fails', async () => {
		const signInWithPassword = vi
			.fn()
			.mockResolvedValue({ error: { status: 400, message: 'Invalid login credentials' } });
		const updateUser = vi.fn();

		const result = await actions.updateEmail(
			makeActionEvent({
				currentPassword: 'wrong-password',
				signInWithPassword,
				updateUser
			})
		);

		expect(result).toMatchObject({
			status: 401,
			data: {
				emailError: 'Current password is incorrect',
				email: 'new@example.test'
			}
		});
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'current@example.test',
			password: 'wrong-password'
		});
		expect(updateUser).not.toHaveBeenCalled();
	});

	it('updates email after current-password reauthentication succeeds', async () => {
		const signInWithPassword = vi.fn().mockResolvedValue(validProof());
		const updateUser = vi.fn().mockResolvedValue({
			data: { user: { id: 'user-123', email: 'current@example.test', new_email: 'new@example.test' } },
			error: null
		});

		const result = await actions.updateEmail(
			makeActionEvent({
				email: 'NEW@EXAMPLE.TEST',
				currentPassword: 'correct-password',
				signInWithPassword,
				updateUser
			})
		);

		expect(result).toEqual({
			emailSuccess: expect.any(String),
			pendingEmail: 'new@example.test'
		});
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'current@example.test',
			password: 'correct-password'
		});
		expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.test' });
	});
});

function validProof() {
	const user = { id: 'user-123' };
	return {
		data: { user, session: { user, access_token: 'proof', refresh_token: 'proof-refresh', expires_at: 4102444800 } },
		error: null
	};
}

describe('security overview', () => {
	it.each([
		{ data: { totp: [] }, error: { message: 'private provider detail' } },
		{ data: null, error: null },
		{ data: {}, error: null },
		{ data: { totp: null }, error: null },
		{ data: { totp: [{ status: 'unknown' }] }, error: null },
		new Error('private provider detail')
	])('keeps MFA status unknown after unavailable factor lookup %# and recovers on reload', async (unavailable) => {
		const listFactors = vi.fn();
		if (unavailable instanceof Error) listFactors.mockRejectedValueOnce(unavailable);
		else listFactors.mockResolvedValueOnce(unavailable);
		listFactors.mockResolvedValueOnce({ data: { totp: [{ status: 'verified' }] }, error: null });
		const event = {
			locals: {
				actor: { userId: 'actor' },
				user: { id: 'actor', email: 'current@example.test', new_email: 'pending@example.test' },
				session: null,
				supabase: { auth: { mfa: { listFactors } } }
			}
		} as unknown as Parameters<typeof load>[0];
		const result = await load(event);
		expect(result).toMatchObject({
			hasMFA: null,
			currentEmail: 'current@example.test',
			pendingEmail: 'pending@example.test'
		});
		expect(JSON.stringify(result)).not.toContain('private');
		expect(await load(event)).toMatchObject({ hasMFA: true });
	});
	it('reports disabled only after an acknowledged empty factor list', async () => {
		const event = {
			locals: {
				actor: { userId: 'actor' },
				user: { id: 'actor', email: 'current@example.test' },
				session: null,
				supabase: { auth: { mfa: { listFactors: async () => ({ data: { totp: [] }, error: null }) } } }
			}
		} as unknown as Parameters<typeof load>[0];
		expect(await load(event)).toMatchObject({ hasMFA: false });
	});
});

it.each(['missing actor', 'mismatched actor', 'missing user'])(
	'denies overview with %s before provider access',
	async (kind) => {
		const listFactors = vi.fn();
		const event = {
			locals: {
				actor: kind === 'missing actor' ? null : { userId: kind === 'mismatched actor' ? 'other' : 'actor' },
				user: kind === 'missing user' ? null : { id: 'actor' },
				supabase: { auth: { mfa: { listFactors } } }
			}
		} as unknown as Parameters<typeof load>[0];
		await expect(load(event)).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(listFactors).not.toHaveBeenCalled();
	}
);
