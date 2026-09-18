import { passwordSessionToken } from '../../../../tests/fixtures/passwordSession';
vi.mock('$env/dynamic/private', () => ({ env: { ACCOUNT_SETUP_SESSION_SECRET: 'synthetic-receipt-secret' } }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, auditLog } = vi.hoisted(() => ({ rpc: vi.fn(), auditLog: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock('$lib/server/auditLog', () => ({ auditLog }));

const proofProvider = vi.hoisted(() => ({ auth: {} as Record<string, unknown> }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: proofProvider.auth }) }));
import { POST } from './+server';

function fixture(authFlow?: 'recovery' | 'invite') {
	const user = { id: 'synthetic-user', email: 'synthetic@example.test' };
	const auth = {
		mfa: {
			getAuthenticatorAssuranceLevel: vi
				.fn()
				.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
		},
		signInWithPassword: vi.fn().mockResolvedValue({
			data: {
				user,
				session: { user, access_token: 'proof-access', refresh_token: 'proof-refresh', expires_at: 1789650000 }
			},
			error: null
		}),
		updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	proofProvider.auth = {
		signInWithPassword: auth.signInWithPassword,
		getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
		mfa: {
			getAuthenticatorAssuranceLevel: vi
				.fn()
				.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })
		},
		signOut: vi.fn().mockResolvedValue({ error: null }),
		admin: { signOut: vi.fn().mockResolvedValue({ error: null }) }
	};
	const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
	const event = () =>
		({
			request: new Request('http://localhost/api/auth/update-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					currentPassword: 'OldSecurePass12',
					password: 'NewSecurePass12',
					confirmPassword: 'NewSecurePass12'
				})
			}),
			locals: {
				user,
				session: {
					user,
					access_token: passwordSessionToken('synthetic-user', 'synthetic-token'),
					expires_at: 1789646460
				},
				authFlow,
				supabase: { auth }
			},
			cookies,
			getClientAddress: () => '192.0.2.1'
		}) as unknown as Parameters<typeof POST>[0];
	return { auth, cookies, event };
}

describe('password updates through the durable provider boundary', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		rpc.mockReset();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it.each([undefined, 'recovery', 'invite'] as const)(
		'stops %s password effects on malformed provider results and permits retry',
		async (flow) => {
			const { auth, cookies, event } = fixture(flow);
			rpc.mockResolvedValue({ data: [{}], error: null });
			await expect(POST(event())).rejects.toThrow();
			expect(auth.signInWithPassword).not.toHaveBeenCalled();
			expect(auth.updateUser).not.toHaveBeenCalled();
			expect(auth.admin.signOut).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();

			rpc.mockResolvedValue({ data: [{ limited: false, retry_after_ms: 900_000 }], error: null });
			const response = await POST(event());
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ ok: true });
			expect(auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: 'NewSecurePass12' });
		}
	);

	it.each(['returned error', 'exception'] as const)(
		'stops all password effects when the IP bucket has a %s after the user bucket succeeds',
		async (mode) => {
			const { auth, cookies, event } = fixture('recovery');
			const failure = new Error('synthetic provider unavailable');
			rpc.mockResolvedValueOnce({ data: [{ limited: false, retry_after_ms: 900_000 }], error: null });
			if (mode === 'exception') rpc.mockRejectedValueOnce(failure);
			else rpc.mockResolvedValueOnce({ data: [{ limited: false, retry_after_ms: 0 }], error: failure });
			await expect(POST(event())).rejects.toBe(failure);
			expect(auth.signInWithPassword).not.toHaveBeenCalled();
			expect(auth.updateUser).not.toHaveBeenCalled();
			expect(auth.admin.signOut).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();
		}
	);

	it.each([
		['user', 1501, 2],
		['ip', 45_000, 45],
		['user', 0, 1]
	] as const)(
		'returns 429 for the %s bucket with retry %i and no password effects',
		async (dimension, retryMs, seconds) => {
			const { auth, cookies, event } = fixture();
			rpc.mockImplementation(async (_name, input) => ({
				data: [{ limited: input.p_bucket_key.includes(`:${dimension}:`), retry_after_ms: retryMs }],
				error: null
			}));
			const response = await POST(event());
			expect(response.status).toBe(429);
			expect(response.headers.get('Retry-After')).toBe(String(seconds));
			expect(await response.json()).toMatchObject({ retryAfterSeconds: seconds });
			expect(auth.signInWithPassword).not.toHaveBeenCalled();
			expect(auth.updateUser).not.toHaveBeenCalled();
			expect(auth.admin.signOut).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();
		}
	);
});
