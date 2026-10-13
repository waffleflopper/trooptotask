import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCookieName, forgedSessions, probeAdmission } from './admission-probe.mjs';

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const genuineToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'user-a', session_id: 's1', email: 'a@example.test' })}.GENUINE-SIGNATURE`;
const genuine = { access_token: genuineToken, refresh_token: 'genuine-refresh', expires_at: 2_000_000_000 };

test('forged variants never archive the genuine signature', () => {
	const forged = forgedSessions(genuine, 'user-b');
	assert.deepEqual(Object.keys(forged), ['badSignature', 'subjectSwap', 'algNone']);
	for (const { archived, cookie } of Object.values(forged)) {
		assert.ok(!archived.includes('GENUINE-SIGNATURE'));
		assert.ok(!Buffer.from(cookie.slice('base64-'.length), 'base64url').toString().includes('genuine-refresh'));
	}
	assert.equal(forged.subjectSwap.claims.sub, 'user-b');
	assert.equal(forged.subjectSwap.claims.email, undefined);
	assert.equal(forged.algNone.archived.endsWith('.'), true);
	assert.equal(forged.badSignature.claims.sub, 'user-a');
});

test('the probe sends every case to each path with the provider cookie name and revokes the genuine session', async () => {
	const calls = [];
	const fetch = async (url, init = {}) => {
		calls.push({ url, cookie: init.headers?.cookie, method: init.method ?? 'GET' });
		if (url.includes('/auth/v1/token')) return Response.json({ ...genuine });
		if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
		return new Response(null, { status: 303, headers: { location: '/auth/login' } });
	};
	const result = await probeAdmission({
		origin: 'http://127.0.0.1:4000',
		providerUrl: 'http://127.0.0.1:56321',
		anonKey: 'anon',
		email: 'a@example.test',
		password: 'synthetic',
		otherUserId: 'user-b',
		fetch
	});
	assert.equal(authCookieName('http://127.0.0.1:56321'), 'sb-127-auth-token');
	assert.equal(result.results.length, 10);
	assert.deepEqual(
		[...new Set(result.results.map((r) => r.case))],
		['genuine', 'malformed', 'badSignature', 'subjectSwap', 'algNone']
	);
	assert.ok(calls.filter((c) => c.cookie).every((c) => c.cookie.startsWith('sb-127-auth-token=')));
	assert.equal(calls.at(-1).url, 'http://127.0.0.1:56321/auth/v1/logout?scope=global');
	assert.ok(!JSON.stringify(result).includes('GENUINE-SIGNATURE'));
	assert.ok(!JSON.stringify(result).includes('genuine-refresh'));
});
