import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { changelog } from '../../src/features/app-shell/changelog.ts';
import { actorArguments, entryPath, sessionCookie, sessionPage } from './provider-session.mjs';

const origin = 'http://127.0.0.1:4100';
const provider = { API_URL: 'http://127.0.0.1:56321', ANON_KEY: 'anon-key' };
const grant = {
	access_token: 'header.payload.signature',
	token_type: 'bearer',
	expires_in: 3600,
	expires_at: 2_000_000_000,
	refresh_token: 'refresh-1',
	weak_password: null,
	user: { id: 'user-1', factors: [] }
};
const storedSession =
	'base64-eyJhY2Nlc3NfdG9rZW4iOiJoZWFkZXIucGF5bG9hZC5zaWduYXR1cmUiLCJ0b2tlbl90eXBlIjoiYmVhcmVyIiwiZXhwaXJlc19pbiI6MzYwMCwiZXhwaXJlc19hdCI6MjAwMDAwMDAwMCwicmVmcmVzaF90b2tlbiI6InJlZnJlc2gtMSIsIndlYWtfcGFzc3dvcmQiOm51bGx9';

test('the session cookie is the stored session without its user, under the app auth cookie options', () => {
	assert.deepEqual(sessionCookie(origin, provider.API_URL, grant, 1_800_000_000_000), {
		name: 'sb-127-auth-token',
		value: storedSession,
		domain: '127.0.0.1',
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'Lax',
		expires: 1_834_560_000
	});
});

test('a verified authenticator sends the actor to the challenge with its destination, as the form does', () => {
	const factors = (status) => ({ ...grant, user: { id: 'user-1', factors: [{ status }] } });
	assert.equal(
		entryPath(factors('verified'), '/dashboard?show=all'),
		'/auth/mfa-verify?next=%2Fdashboard%3Fshow%3Dall'
	);
	assert.equal(entryPath(factors('unverified'), '/dashboard?show=all'), '/dashboard?show=all');
	assert.equal(entryPath(grant, '/org/a/personnel'), '/org/a/personnel');
});

test('actor uses a provider session unless --form asks for the visible sign-in form', () => {
	assert.deepEqual(actorArguments(['--form', 'identityMfa', 'dashboard']), {
		form: true,
		showWhatsNew: false,
		args: ['identityMfa', 'dashboard']
	});
	assert.deepEqual(actorArguments(['perfWide', 'personnel', 'large']), {
		form: false,
		showWhatsNew: false,
		args: ['perfWide', 'personnel', 'large']
	});
});

function scenario({ grantStatus = 200 } = {}) {
	const requests = [];
	const opened = [];
	const cookies = [];
	const resources = { disconnected: false };
	const storage = new Map();
	let pageUrl;
	const fetch = async (url, init) => {
		requests.push({ url, apikey: init.headers.apikey, body: JSON.parse(init.body) });
		return Response.json(grantStatus === 200 ? grant : { error: 'invalid_grant' }, { status: grantStatus });
	};
	const call = async (name, args) => {
		assert.equal(name, 'new_page');
		opened.push(args);
		pageUrl = args.url;
		return { content: [{ type: 'text', text: `1: about:blank\n9: ${args.url} [selected]` }] };
	};
	const browser = {
		pages: async () => [
			{ url: () => `${origin}/og-image.png?session=other` },
			{
				url: () => pageUrl,
				browserContext: () => ({ setCookie: async (cookie) => cookies.push(cookie) }),
				evaluate: async (script) =>
					runInNewContext(script, {
						localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
					})
			}
		],
		disconnect: async () => {
			resources.disconnected = true;
		}
	};
	const run = (input) =>
		sessionPage(
			{ state: { origin }, session: '/unused', input, call, provider },
			{
				inspectOwnership: async () => 'ws://127.0.0.1:43211/devtools/browser/owned',
				connect: async ({ browserWSEndpoint }) => {
					assert.equal(browserWSEndpoint, 'ws://127.0.0.1:43211/devtools/browser/owned');
					return browser;
				},
				fetch
			}
		);
	return { run, requests, opened, cookies, resources, storage };
}

const input = {
	email: 'manager@example.test',
	password: 'Synthetic-only',
	destination: '/org/a/personnel',
	isolatedContext: 'map-manager-1'
};

test('a session page signs in at the provider and stores that session in the new page context', async () => {
	const { run, requests, opened, cookies, resources } = scenario();

	const result = await run(input);

	assert.deepEqual(result, { status: 'PASS', pageId: 9, path: '/org/a/personnel' });
	assert.deepEqual(requests, [
		{
			url: 'http://127.0.0.1:56321/auth/v1/token?grant_type=password',
			apikey: 'anon-key',
			body: { email: 'manager@example.test', password: 'Synthetic-only' }
		}
	]);
	assert.equal(opened.length, 1);
	assert.equal(opened[0].isolatedContext, 'map-manager-1');
	assert.match(opened[0].url, /^http:\/\/127\.0\.0\.1:4100\/og-image\.png\?session=[0-9a-f-]{36}$/);
	assert.deepEqual(
		cookies.map(({ name, value, httpOnly, secure }) => ({ name, value, httpOnly, secure })),
		[{ name: 'sb-127-auth-token', value: storedSession, httpOnly: true, secure: true }]
	);
	assert.equal(resources.disconnected, true);
});

test('a refused provider sign-in opens no page', async () => {
	const { run, opened } = scenario({ grantStatus: 400 });

	await assert.rejects(run(input), { code: 'PROVIDER_SESSION', message: 'Provider sign-in failed (HTTP 400).' });
	assert.deepEqual(opened, []);
});

test('a destination outside the app is refused before any sign-in', async () => {
	const { run, requests } = scenario();

	for (const destination of ['//foreign.example/org', 'org/a', undefined])
		await assert.rejects(run({ ...input, destination }), { code: 'SESSION_INPUT' });
	assert.deepEqual(requests, []);
});

test('owned sessions persist the app dismissal preference before navigation, with an opt-out', async () => {
	const { run, storage } = scenario();
	await run(input);
	assert.equal(storage.get('changelog-last-seen-user-1'), changelog[0].id);
	await run({ ...input, showWhatsNew: true });
	assert.equal(storage.has('changelog-last-seen-user-1'), false);
	assert.deepEqual(actorArguments(['--show-whats-new', '--form', 'manager', 'home']), {
		form: true,
		showWhatsNew: true,
		args: ['manager', 'home']
	});
});
