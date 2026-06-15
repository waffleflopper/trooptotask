import { describe, expect, it, vi } from 'vitest';
import { actions } from './+page.server';

function makeActionEvent(input: {
	email?: string;
	currentPassword?: string;
	userEmail?: string | null;
	signInWithPassword?: ReturnType<typeof vi.fn>;
	updateUser?: ReturnType<typeof vi.fn>;
}) {
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
		locals: {
			user: { id: 'user-123', email: input.userEmail ?? 'current@example.test' },
			supabase: {
				auth: {
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
		const signInWithPassword = vi.fn().mockResolvedValue({ error: { message: 'Invalid login credentials' } });
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
		const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
		const updateUser = vi.fn().mockResolvedValue({ error: null });

		const result = await actions.updateEmail(
			makeActionEvent({
				email: 'NEW@EXAMPLE.TEST',
				currentPassword: 'correct-password',
				signInWithPassword,
				updateUser
			})
		);

		expect(result).toEqual({
			emailSuccess: 'Check the new inbox to confirm this change. Until then, keep signing in with your current email.',
			pendingEmail: 'new@example.test'
		});
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'current@example.test',
			password: 'correct-password'
		});
		expect(updateUser).toHaveBeenCalledWith({ email: 'new@example.test' });
	});
});
