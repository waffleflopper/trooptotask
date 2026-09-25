import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	checkAdminAuthEmailRateLimit,
	createSupabasePlatformUserIdentityCommandStore,
	createSupabasePlatformUserIdentityCommands
} from './supabasePlatformUserIdentityCommands';

const { sendPlatformAuthEmailMock, getAuthConfirmRedirectToMock } = vi.hoisted(() => ({
	sendPlatformAuthEmailMock: vi.fn(),
	getAuthConfirmRedirectToMock: vi.fn(
		(origin: string, type: string) => `${origin}/auth/confirm?type=${type}&next=%2Fauth%2Freset-password`
	)
}));
vi.mock('$features/identity/index.server', () => ({
	sendPlatformAuthEmail: sendPlatformAuthEmailMock,
	getAuthConfirmRedirectTo: getAuthConfirmRedirectToMock
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_ERROR = { message: 'raw provider outage', code: 'provider_secret_code' };

describe('createSupabasePlatformUserIdentityCommandStore', () => {
	beforeEach(() => vi.clearAllMocks());

	it('maps auth user email lookup success, missing users, missing email, and provider errors', async () => {
		const getUserById = vi
			.fn()
			.mockResolvedValueOnce({ data: { user: { id: USER_ID, email: 'soldier@example.mil' } }, error: null })
			.mockResolvedValueOnce({ data: { user: null }, error: null })
			.mockResolvedValueOnce({ data: { user: { id: USER_ID, email: null } }, error: null })
			.mockResolvedValueOnce({ data: null, error: { status: 404, message: 'User not found' } })
			.mockResolvedValueOnce({ data: null, error: PROVIDER_ERROR });
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = createSupabasePlatformUserIdentityCommandStore({ auth: { admin: { getUserById } } } as never);

		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'found', email: 'soldier@example.mil' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({ status: 'not_found' });
		await expect(store.getUserEmailById(USER_ID)).resolves.toEqual({
			status: 'provider_error',
			message: 'Failed to load user identity'
		});
		expect(consoleError).toHaveBeenCalledWith('[admin/users] Unable to load user identity');
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain('provider_secret_code');
		consoleError.mockRestore();
	});

	it('delivers admin recovery and invite mail through the app with the looked-up user identity', async () => {
		sendPlatformAuthEmailMock.mockResolvedValue('sent');
		const client = { auth: { admin: { getUserById: vi.fn() } } } as never;
		const store = createSupabasePlatformUserIdentityCommandStore(client);
		const base = { userId: USER_ID, email: 'soldier@example.mil' };
		const recovery = { ...base, redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery' };
		const invite = { ...base, redirectTo: 'https://trooptotask.org/auth/confirm?type=invite' };

		await expect(store.sendPasswordResetEmail(recovery)).resolves.toEqual({ ok: true });
		await expect(store.sendInviteEmail(invite)).resolves.toEqual({ ok: true });
		expect(sendPlatformAuthEmailMock).toHaveBeenNthCalledWith(1, {
			type: 'recovery',
			userId: USER_ID,
			email: base.email,
			redirectTo: recovery.redirectTo
		});
		expect(sendPlatformAuthEmailMock).toHaveBeenNthCalledWith(2, {
			type: 'invite',
			userId: USER_ID,
			email: base.email,
			redirectTo: invite.redirectTo
		});
	});

	it('reports failed delivery without exposing provider details', async () => {
		sendPlatformAuthEmailMock.mockResolvedValue('failed');
		const store = createSupabasePlatformUserIdentityCommandStore({ auth: { admin: {} } } as never);
		const input = { userId: USER_ID, email: 'soldier@example.mil', redirectTo: 'https://trooptotask.org/auth/confirm' };
		await expect(store.sendPasswordResetEmail(input)).resolves.toEqual({
			ok: false,
			message: 'Failed to send password reset email'
		});
		await expect(store.sendInviteEmail(input)).resolves.toEqual({ ok: false, message: 'Failed to send invite email' });
	});

	it('uses Identity confirmation URL policy when composing a Platform reset', async () => {
		sendPlatformAuthEmailMock.mockResolvedValue('sent');
		const getUserById = vi.fn().mockResolvedValue({
			data: { user: { id: USER_ID, email: 'soldier@example.mil' } },
			error: null
		});
		const commands = createSupabasePlatformUserIdentityCommands({
			adminClient: { auth: { admin: { getUserById } } },
			audit: vi.fn()
		} as never);

		await expect(
			commands.sendPasswordReset({ userId: USER_ID, inboundOrigin: 'https://trooptotask.org' })
		).resolves.toMatchObject({ status: 'sent' });
		expect(getAuthConfirmRedirectToMock).toHaveBeenCalledWith('https://trooptotask.org', 'recovery');
		expect(sendPlatformAuthEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				redirectTo: 'https://trooptotask.org/auth/confirm?type=recovery&next=%2Fauth%2Freset-password'
			})
		);
	});
});

describe('admin auth email rate limit', () => {
	it('limits repeated emails per target and action across requests', async () => {
		const counts = new Map<string, number>();
		const rpc = vi.fn(async (_name: string, args: { p_bucket_key: string; p_max_requests: number }) => {
			const count = (counts.get(args.p_bucket_key) ?? 0) + 1;
			counts.set(args.p_bucket_key, count);
			return {
				data: { limited: count > args.p_max_requests, retry_after_ms: count > args.p_max_requests ? 60_000 : 0 },
				error: null
			};
		});
		const supabase = { rpc } as never;
		const otherUser = '22222222-2222-4222-8222-222222222222';

		for (let attempt = 0; attempt < 3; attempt++) {
			await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'recovery')).resolves.toBe(false);
		}
		await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'recovery')).resolves.toBe(true);
		await expect(checkAdminAuthEmailRateLimit(supabase, USER_ID, 'invite')).resolves.toBe(false);
		await expect(checkAdminAuthEmailRateLimit(supabase, otherUser, 'recovery')).resolves.toBe(false);
		expect([...counts.keys()]).toHaveLength(3);
	});
});
