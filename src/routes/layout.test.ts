import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('root layout load', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('does not expose a supabase client in server-rendered page data', async () => {
		const createServerClient = vi.fn();

		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
		}));
		vi.doMock('@supabase/ssr', () => ({
			createBrowserClient: vi.fn(),
			createServerClient,
			isBrowser: () => false
		}));

		const { load } = await import('./+layout');
		const result = await load({
			data: { session: { user: { id: 'user-1' } } },
			depends: vi.fn(),
			fetch: vi.fn()
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			session: { user: { id: 'user-1' } }
		});
		expect(result).not.toHaveProperty('supabase');
		expect(createServerClient).not.toHaveBeenCalled();
	});

	it('reuses server-provided session data in the browser instead of creating a browser auth client', async () => {
		const createBrowserClient = vi.fn();

		vi.doMock('$env/static/public', () => ({
			PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
			PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
		}));
		vi.doMock('@supabase/ssr', () => ({
			createBrowserClient,
			createServerClient: vi.fn(),
			isBrowser: () => true
		}));

		const { load } = await import('./+layout');
		const result = await load({
			data: { session: { user: { id: 'user-2' } } },
			depends: vi.fn(),
			fetch: vi.fn()
		} as unknown as Parameters<typeof load>[0]);

		expect(result).toEqual({
			session: { user: { id: 'user-2' } }
		});
		expect(createBrowserClient).not.toHaveBeenCalled();
	});
});
