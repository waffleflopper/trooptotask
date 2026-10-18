import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from './hooks.server';

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://refresh.invalid',
	PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon'
}));
vi.mock('$lib/server/env', () => ({}));

const NOW = new Date('2026-10-18T12:00:00Z');
const USER_ID = '00000000-0000-4000-8000-000000000001';
const PROVIDER_SESSION_ID = '00000000-0000-4000-8000-0000000000aa';
const REFRESH_MARGIN_SECONDS = 90;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function accessToken(label: string, expiresAt: number): string {
	return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
		sub: USER_ID,
		session_id: PROVIDER_SESSION_ID,
		amr: [{ method: 'password' }],
		aud: 'authenticated',
		aal: 'aal1',
		label,
		iat: Math.floor(NOW.getTime() / 1000),
		exp: expiresAt
	})}.${encode('synthetic-signature')}`;
}

const user = {
	id: USER_ID,
	aud: 'authenticated',
	email: 'synthetic@example.test',
	app_metadata: {},
	user_metadata: {}
};

async function createProvider(initialTokenLifetimeSeconds: number) {
	const jar = new Map<string, string>();
	const nowSeconds = () => Math.floor(Date.now() / 1000);
	const refreshTokens = new Set(['refresh-0']);
	const refreshCalls: string[] = [];
	const bearersByPath: [string, string | null][] = [];
	let rotations = 0;

	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		bearersByPath.push([url.pathname, request.headers.get('authorization')]);
		if (url.pathname === '/auth/v1/user') return Response.json(user);
		if (url.pathname === '/rest/v1/rpc/get_current_session_started_at') return Response.json(new Date().toISOString());
		if (url.pathname === '/rest/v1/personnel') return Response.json([]);
		if (url.pathname === '/auth/v1/token') {
			const { refresh_token: presented } = (await request.json()) as { refresh_token: string };
			refreshCalls.push(presented);
			if (!refreshTokens.delete(presented))
				return Response.json({ code: 'refresh_token_already_used', message: 'Already used' }, { status: 400 });
			rotations += 1;
			refreshTokens.add(`refresh-${rotations}`);
			const expiresAt = nowSeconds() + 3600;
			return Response.json({
				access_token: accessToken(`rotated-${rotations}`, expiresAt),
				refresh_token: `refresh-${rotations}`,
				expires_in: 3600,
				expires_at: expiresAt,
				token_type: 'bearer',
				user
			});
		}
		throw new Error(`Unexpected provider request: ${url.pathname}`);
	});

	const getAll = () => [...jar].map(([name, value]) => ({ name, value }));
	const setup = createServerClient('https://refresh.invalid', 'synthetic-anon', {
		cookies: {
			encode: 'tokens-only',
			getAll,
			setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value))
		}
	});
	const initial = await setup.auth.setSession({
		access_token: accessToken('initial', nowSeconds() + initialTokenLifetimeSeconds),
		refresh_token: 'refresh-0'
	});
	expect(initial.error).toBeNull();
	bearersByPath.length = 0;

	let generated = false;
	const cookieSets: string[] = [];
	const request = () => {
		generated = false;
		return {
			url: new URL('https://app.invalid/api/auth/mfa/status'),
			request: new Request('https://app.invalid/api/auth/mfa/status', { method: 'GET' }),
			locals: {},
			getClientAddress: () => `synthetic-refresh-${Math.random()}`,
			cookies: {
				getAll,
				get: (name: string) => jar.get(name),
				set: (name: string, value: string) => {
					if (generated) throw new Error('Cannot use `cookies.set(...)` after the response has been generated');
					cookieSets.push(name);
					jar.set(name, value);
				},
				delete: (name: string) => jar.delete(name)
			}
		} as unknown as Parameters<Handle>[0]['event'];
	};
	const resolve = async () => {
		generated = true;
		return new Response('streaming');
	};
	return { request, resolve, refreshCalls, bearersByPath, cookieSets, rotations: () => rotations };
}

describe('provider session refresh around the response', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('leaves a fresh session alone', async () => {
		const provider = await createProvider(3600);
		const event = provider.request();

		const response = await handle({ event, resolve: provider.resolve });

		expect(await response.text()).toBe('streaming');
		expect(provider.refreshCalls).toEqual([]);
		expect(provider.cookieSets).toEqual([]);
	});

	it('refreshes a session that would reach the refresh margin during a stream before the response is generated', async () => {
		const provider = await createProvider(REFRESH_MARGIN_SECONDS + 200);
		const first = provider.request();

		await handle({ event: first, resolve: provider.resolve });

		expect(provider.refreshCalls).toEqual(['refresh-0']);
		expect(provider.cookieSets).toEqual(['sb-refresh-auth-token']);
		expect(first.locals.session?.refresh_token).toBe('refresh-1');
		expect(first.locals.user?.id).toBe(USER_ID);

		const second = provider.request();
		await handle({ event: second, resolve: provider.resolve });

		expect(provider.refreshCalls).toEqual(['refresh-0']);
		expect(second.locals.session?.refresh_token).toBe('refresh-1');
		expect(second.locals.user?.id).toBe(USER_ID);
	});

	it('survives a refresh that the provider client makes after the response is generated', async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		try {
			const provider = await createProvider(3600);
			const event = provider.request();
			await handle({ event, resolve: provider.resolve });
			expect(provider.refreshCalls).toEqual([]);

			vi.setSystemTime(new Date(NOW.getTime() + (3600 - REFRESH_MARGIN_SECONDS + 10) * 1000));
			const streamed = await event.locals.supabase.from('personnel').select('id');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(streamed.error).toBeNull();
			expect(streamed.data).toEqual([]);
			expect(provider.refreshCalls).toEqual(['refresh-0']);
			expect(provider.bearersByPath.at(-1)?.[0]).toBe('/rest/v1/personnel');
			expect(provider.bearersByPath.at(-1)?.[1]).toMatch(/^Bearer .+/);
			expect(provider.cookieSets).toEqual([]);
			expect(warn).toHaveBeenCalledExactlyOnceWith('[auth-session]', {
				event: 'cookies_dropped_after_response',
				count: 1
			});
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});
});
