import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdentityPlatformAccountEmailPort } from './platformAccountEmail.server';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function port(fetch: typeof globalThis.fetch) {
	return createIdentityPlatformAccountEmailPort(
		createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch }
		})
	);
}

beforeEach(() => {
	vi.stubEnv('RESEND_API_KEY', 'synthetic-key');
	vi.stubEnv('RESEND_FROM_EMAIL', 'TroopToTask <synthetic@example.test>');
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Identity platform account email source', () => {
	it('uses the bound identity provider and delivers only an app-owned recovery confirmation link', async () => {
		const type = 'recovery';
		const generated: unknown[] = [];
		const source = port(async (input, init) => {
			const request = new Request(input, init);
			const url = new URL(request.url);
			if (url.pathname === `/auth/v1/admin/users/${USER}`)
				return Response.json({ id: USER, email: 'soldier@example.test', created_at: '2026-06-01' });
			expect(url.pathname).toBe('/auth/v1/admin/generate_link');
			generated.push(await request.json());
			return Response.json({
				id: USER,
				email: 'soldier@example.test',
				created_at: '2026-06-01',
				hashed_token: 'synthetic-token',
				verification_type: type,
				action_link: 'https://provider.example/secret'
			});
		});
		const messages: unknown[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(input).toBe('https://api.resend.com/emails');
			messages.push(JSON.parse(String(init?.body)));
			return Response.json({ id: 'synthetic-delivery' });
		});
		await expect(source.getUserEmailById(USER)).resolves.toEqual({ status: 'found', email: 'soldier@example.test' });
		const input = {
			userId: USER,
			email: 'soldier@example.test',
			redirectTo: `https://app.example.test/auth/confirm?type=${type}`
		};
		await expect(source.sendPasswordResetEmail(input)).resolves.toEqual({ ok: true });
		expect(generated).toHaveLength(1);
		expect(messages).toHaveLength(1);
		expect(JSON.stringify(messages)).toContain(`https://app.example.test/auth/confirm?type=${type}`);
		expect(JSON.stringify(messages)).toContain('token_hash=synthetic-token');
		expect(JSON.stringify(messages)).not.toContain('provider.example');
	});

	it.each([
		{
			name: 'missing email',
			body: { id: USER, email: null, created_at: '2026-06-01' },
			status: 200,
			expected: { status: 'not_found' }
		},
		{ name: 'unknown account', body: { message: 'User not found' }, status: 404, expected: { status: 'not_found' } },
		{
			name: 'provider error',
			body: { message: 'private-provider-detail' },
			status: 503,
			expected: { status: 'provider_error', message: 'Unable to load user identity' }
		},
		{
			name: 'another account',
			body: { id: OTHER, email: 'foreign@example.test', created_at: '2026-06-01' },
			status: 200,
			expected: { status: 'provider_error', message: 'Unable to load user identity' }
		}
	])('keeps $name from becoming a sendable account', async ({ body, status, expected }) => {
		await expect(port(async () => Response.json(body, { status })).getUserEmailById(USER)).resolves.toEqual(expected);
	});

	it('does not deliver a provider link belonging to another User', async () => {
		const source = port(async () =>
			Response.json({
				id: OTHER,
				email: 'soldier@example.test',
				created_at: '2026-06-01',
				hashed_token: 'private-token',
				verification_type: 'recovery'
			})
		);
		const send = vi.fn();
		vi.stubGlobal('fetch', send);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			source.sendPasswordResetEmail({
				userId: USER,
				email: 'soldier@example.test',
				redirectTo: 'https://app.example.test/auth/confirm?type=recovery'
			})
		).resolves.toEqual({ ok: false, message: 'Failed to send password reset email' });
		expect(send).not.toHaveBeenCalled();
	});

	it('reports failed delivery without disclosing provider or credential details', async () => {
		const source = port(async () =>
			Response.json({
				id: USER,
				email: 'soldier@example.test',
				created_at: '2026-06-01',
				hashed_token: 'private-token',
				verification_type: 'recovery'
			})
		);
		vi.stubGlobal('fetch', async () => Response.json({ message: 'private-delivery-detail' }, { status: 503 }));
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			source.sendPasswordResetEmail({
				userId: USER,
				email: 'soldier@example.test',
				redirectTo: 'https://app.example.test/auth/confirm?type=recovery'
			})
		).resolves.toEqual({ ok: false, message: 'Failed to send password reset email' });
		expect(JSON.stringify(error.mock.calls)).not.toMatch(/private-token|private-delivery-detail/);
	});
});
