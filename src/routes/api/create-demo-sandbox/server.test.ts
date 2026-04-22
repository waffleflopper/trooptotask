import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('POST /api/create-demo-sandbox', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('rejects standalone sandbox bootstrap outside the deprecated demo flow', async () => {
		const createClient = vi.fn();

		vi.doMock('@supabase/supabase-js', () => ({
			createClient
		}));
		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co'
		}));
		vi.doMock('$env/dynamic/private', () => ({
			env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' }
		}));

		const { POST } = await import('./+server');
		const cookies = {
			get: vi.fn(() => undefined),
			set: vi.fn(),
			delete: vi.fn()
		};

		await expect(POST({ cookies } as unknown as Parameters<typeof POST>[0])).rejects.toMatchObject({
			status: 403
		});
		expect(createClient).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('creates a sandbox for legacy read-only demo requests', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: 'org-123', error: null });
		const createClient = vi.fn(() => ({ rpc }));

		vi.doMock('@supabase/supabase-js', () => ({
			createClient
		}));
		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co'
		}));
		vi.doMock('$env/dynamic/private', () => ({
			env: { SUPABASE_SERVICE_ROLE_KEY: 'service-role' }
		}));

		const { POST } = await import('./+server');
		const cookies = {
			get: vi.fn((name: string) => (name === 'demo_mode' ? 'readonly' : undefined)),
			set: vi.fn(),
			delete: vi.fn()
		};

		const response = await POST({ cookies } as unknown as Parameters<typeof POST>[0]);

		expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'service-role', {
			auth: { persistSession: false }
		});
		expect(rpc).toHaveBeenCalledWith('create_demo_sandbox', {
			p_session_id: expect.any(String)
		});
		expect(cookies.delete).toHaveBeenCalledWith('demo_mode', { path: '/' });

		expect(cookies.set).toHaveBeenCalledTimes(1);
		const [cookieName, cookieValue, cookieOptions] = cookies.set.mock.calls[0];
		expect(cookieName).toBe('demo_sandbox');
		const parsedCookie = JSON.parse(cookieValue as string) as { orgId: string; sessionId: string };
		expect(parsedCookie.orgId).toBe('org-123');
		expect(parsedCookie.sessionId).toEqual(expect.any(String));
		expect(cookieOptions).toEqual(
			expect.objectContaining({
				path: '/',
				maxAge: 60 * 60,
				httpOnly: true,
				sameSite: 'lax',
				secure: false
			})
		);

		expect(await response.json()).toEqual({
			success: true,
			orgId: 'org-123',
			expiresIn: '1 hour'
		});
	});
});
