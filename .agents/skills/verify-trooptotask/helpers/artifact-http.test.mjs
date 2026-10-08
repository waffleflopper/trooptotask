import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { artifactHttp as requestArtifactHttp, clearArtifactHttpCache } from './artifact-http.mjs';

const origin = 'http://127.0.0.1:43210';
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '10000000-0000-4000-8000-000000000002';
const person = '20000000-0000-4000-8000-000000000001';
const record = '30000000-0000-4000-8000-000000000001';
const sessionId = '50000000-0000-4000-8000-000000000001';
const fixture = {
	ids: { orgA, orgB },
	actors: {
		manager: {
			id: '40000000-0000-4000-8000-000000000001',
			email: 'manager@example.invalid',
			password: 'synthetic-private-password'
		}
	}
};
const endpoint = `/org/${orgA}/api/personnel/${person}/leader-notes`;
const args = (method = 'GET', route = 'leader-notes', body) => [
	'manager',
	'orgA',
	person,
	method,
	route,
	...(body ? [body] : [])
];
const redirect = (
	location = '/dashboard',
	cookies = [
		'session.0=private-chunk-one; Path=/; HttpOnly; Secure',
		'session.1=private-chunk-two; Path=/; HttpOnly; Secure'
	]
) => {
	const headers = new Headers({ Location: location });
	for (const cookie of cookies) headers.append('Set-Cookie', cookie);
	return new Response(null, { status: 303, headers });
};

async function inputs(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-artifact-http-'));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const evidenceRoot = path.join(root, 'evidence');
	await fs.mkdir(evidenceRoot);
	const bodyFile = path.join(evidenceRoot, 'body.json');
	return { root, evidenceRoot, bodyFile, session: root, sessionId };
}

async function artifactHttp(options) {
	if (options.session) return requestArtifactHttp(options);
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-artifact-http-private-'));
	try {
		return await requestArtifactHttp({ ...options, session, sessionId });
	} finally {
		await fs.rm(session, { recursive: true, force: true });
	}
}

function authenticated(action, loginCookies) {
	const calls = [];
	return {
		calls,
		fetchImpl: async (url, options) => {
			calls.push({ url, ...options });
			if (calls.length === 1) {
				const response = redirect('/dashboard', loginCookies);
				// SvelteKit's default */* negotiation returns an action result at HTTP 200.
				// A normal HTML form instead receives the actual HTTP redirect.
				return options.headers.get('Accept') === 'text/html'
					? response
					: Response.json({ type: 'redirect', status: 303, location: '/dashboard' }, { headers: response.headers });
			}
			if (calls.length === 2) return redirect('/dashboard', []);
			return action(url, options);
		}
	};
}

test('award acknowledgement uses normal authenticated POST and preserves true and false bodies', async (t) => {
	const input = await inputs(t);
	for (const acknowledged of [true, false]) {
		await fs.writeFile(input.bodyFile, JSON.stringify({ acknowledged }));
		const http = authenticated((url, options) => {
			assert.equal(url, `${origin}/org/${orgA}/api/personnel/${person}/award-tracking`);
			assert.equal(options.method, 'POST');
			assert.deepEqual(JSON.parse(options.body), { acknowledged });
			assert.equal(options.headers.get('Cookie'), 'session.0=private-chunk-one; session.1=private-chunk-two');
			return Response.json({ personnelId: person, acknowledged });
		});
		const output = await artifactHttp({
			origin,
			fixture,
			args: args('POST', 'award-tracking', input.bodyFile),
			evidenceRoot: input.evidenceRoot,
			...http
		});
		assert.equal(output.status, 200);
		assert.deepEqual(output.body, { personnelId: person, acknowledged });
		assert.deepEqual(output.request.body, { acknowledged });
	}
});

test('award control rejects other verbs, item paths and nonboolean or extra fields before authentication', async (t) => {
	const input = await inputs(t);
	for (const [method, route, body] of [
		['GET', 'award-tracking', null],
		['POST', `award-tracking/${record}`, { acknowledged: true }],
		['POST', 'award-tracking', { acknowledged: 'true' }],
		['POST', 'award-tracking', { acknowledged: true, personnelId: person }],
		['POST', 'award-tracking', {}]
	]) {
		if (body) await fs.writeFile(input.bodyFile, JSON.stringify(body));
		let requests = 0;
		await assert.rejects(
			artifactHttp({
				origin,
				fixture,
				args: args(method, route, body ? input.bodyFile : undefined),
				...input,
				fetchImpl: async () => {
					requests++;
					throw new Error('Unexpected request');
				}
			}),
			/award|allowlisted/i
		);
		assert.equal(requests, 0);
	}
});

test('normal form login is independently confirmed and private chunk cookies reach the exact artifact route', async () => {
	const http = authenticated(() =>
		Response.json({ title: 'Synthetic private note', notes: 'Full private field' }, { status: 403 })
	);
	const output = await artifactHttp({ origin, fixture, args: args(), ...http });
	assert.equal(http.calls.length, 3);
	assert.equal(http.calls[0].url, `${origin}/auth/login?/login`);
	assert.deepEqual(Object.fromEntries(http.calls[0].body), {
		email: fixture.actors.manager.email,
		password: fixture.actors.manager.password,
		next: '/dashboard'
	});
	assert.equal(http.calls[0].headers.get('Origin'), origin);
	assert.equal(http.calls[0].headers.get('Accept'), 'text/html');
	assert.equal(http.calls[0].redirect, 'manual');
	assert.equal(http.calls[1].url, `${origin}/auth/login`);
	assert.equal(http.calls[1].headers.get('Accept'), 'text/html');
	assert.equal(http.calls[2].url, `${origin}${endpoint}`);
	assert.equal(http.calls[2].headers.get('Cookie'), 'session.0=private-chunk-one; session.1=private-chunk-two');
	assert.equal(output.actorId, fixture.actors.manager.id);
	assert.equal(output.path, endpoint);
	assert.equal(output.status, 403);
	assert.equal(output.body.notes, 'Full private field');
	assert.ok(!JSON.stringify(output).includes('private-chunk'));
	assert.ok(!JSON.stringify(output).includes(fixture.actors.manager.password));
});

test('failed login, pending MFA, unusable cookies and a false positive login redirect cannot send an artifact action', async () => {
	for (const first of [
		new Response('Login error includes credentials', { status: 400 }),
		Response.json({ type: 'redirect', status: 303, location: '/dashboard' }, { headers: redirect().headers }),
		redirect('/auth/mfa-verify'),
		redirect('/dashboard', [])
	]) {
		let calls = 0;
		await assert.rejects(
			artifactHttp({
				origin,
				fixture,
				args: args(),
				fetchImpl: async () => {
					calls++;
					return first;
				}
			}),
			/login/
		);
		assert.equal(calls, 1);
	}
	let calls = 0;
	await assert.rejects(
		artifactHttp({
			origin,
			fixture,
			args: args(),
			fetchImpl: async () => {
				calls++;
				return calls === 1 ? redirect() : new Response('Still unauthenticated', { status: 200 });
			}
		}),
		/Independent authenticated-session check failed/
	);
	assert.equal(calls, 2);
});

test('cookie rotation honors chunk deletion, domain, expiry and path boundaries', async () => {
	const calls = [];
	const output = await artifactHttp({
		origin,
		fixture,
		args: args(),
		fetchImpl: async (url, options) => {
			calls.push({ url, ...options });
			if (calls.length === 1)
				return redirect('/dashboard', [
					'session.0=old-private-session; Path=/',
					'session.1=deleted-private-session; Path=/',
					'auth-only=private-auth; Path=/auth',
					'other-domain=private-foreign; Domain=example.invalid; Path=/',
					'old=private-expired; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/'
				]);
			if (calls.length === 2)
				return redirect('/dashboard', [
					'session.0=new-private-session; Path=/; Domain=127.0.0.1',
					'session.1=; Path=/; Max-Age=0',
					'near-path=private-near; Path=/orgish',
					'default-path=private-default'
				]);
			assert.equal(options.headers.get('Cookie'), 'session.0=new-private-session');
			return Response.json({ success: true });
		}
	});
	assert.ok(calls[1].headers.get('Cookie').includes('auth-only=private-auth'));
	assert.ok(!calls[1].headers.get('Cookie').includes('private-foreign'));
	assert.ok(!calls[1].headers.get('Cookie').includes('private-expired'));
	assert.equal(output.body.success, true);
});

test('unknown actors, organizations, UUIDs, routes, methods, origins and file escapes are rejected before login', async (t) => {
	const { root, evidenceRoot, bodyFile } = await inputs(t);
	const outside = path.join(root, 'outside.json');
	await fs.writeFile(outside, '{}');
	await fs.symlink(outside, bodyFile);
	const invalid = [
		['missing', 'orgA', person, 'GET', 'leader-notes'],
		['__proto__', 'orgA', person, 'GET', 'leader-notes'],
		['manager', 'unknown', person, 'GET', 'leader-notes'],
		['manager', 'orgA', '../person', 'GET', 'leader-notes'],
		args('GET', 'documents/invalid/download'),
		args('GET', `counseling-records/${record}/download`),
		args('GET', 'leader-notes?extra=1'),
		args('GET', 'leader-notes/../documents'),
		args('GET', `leader-notes/${record}`),
		args('POST', `documents/${record}`, bodyFile),
		args('PUT'),
		args('GET', 'leader-notes', bodyFile),
		args('PATCH', `leader-notes/${record}`),
		args('POST', 'leader-notes', outside),
		args('POST', 'leader-notes', bodyFile)
	];
	const fetchImpl = () => {
		assert.fail('A rejected input must not make an HTTP request.');
	};
	for (const input of invalid)
		await assert.rejects(artifactHttp({ origin, fixture, evidenceRoot, args: input, fetchImpl }));
	for (const badOrigin of [
		'https://example.invalid',
		'http://127.0.0.1:43210/path',
		'http://user:secret@127.0.0.1:43210',
		origin + '?token=secret'
	])
		await assert.rejects(artifactHttp({ origin: badOrigin, fixture, args: args(), fetchImpl }));
	await fs.unlink(bodyFile);
	await fs.writeFile(
		bodyFile,
		JSON.stringify({ title: 'Synthetic', file: { path: outside, type: 'application/pdf' } })
	);
	await assert.rejects(
		artifactHttp({ origin, fixture, evidenceRoot, args: args('POST', 'documents', bodyFile), fetchImpl })
	);
});

test('JSON writes and foreign Organization requests preserve submitted fields and full sanitized error bodies', async (t) => {
	const { evidenceRoot, bodyFile } = await inputs(t);
	await fs.writeFile(bodyFile, JSON.stringify({ title: 'Synthetic title', notes: 'Synthetic notes' }));
	const large = 'Private error detail '.repeat(2000);
	const http = authenticated((url, options) => {
		assert.equal(url, `${origin}/org/${orgB}/api/personnel/${person}/follow-ups/${record}`);
		assert.equal(options.method, 'PATCH');
		assert.equal(options.headers.get('Content-Type'), 'application/json');
		assert.deepEqual(JSON.parse(options.body), { title: 'Synthetic title', notes: 'Synthetic notes' });
		return Response.json(
			{
				error: large,
				privateRecord: { summary: 'Preserved secret record field' },
				access_token: 'private-access',
				url: 'http://127.0.0.1/storage/object/sign/records/file.pdf?token=private-signed-token',
				echo: fixture.actors.manager.password,
				cookie: 'private-cookie'
			},
			{ status: 404 }
		);
	});
	const output = await artifactHttp({
		origin,
		fixture,
		evidenceRoot,
		args: ['manager', 'orgB', person, 'PATCH', `follow-ups/${record}`, bodyFile],
		...http
	});
	assert.equal(output.organizationId, orgB);
	assert.deepEqual(output.request.body, { title: 'Synthetic title', notes: 'Synthetic notes' });
	assert.equal(output.request.source, 'body.json');
	assert.equal(output.body.error, large);
	assert.equal(output.body.privateRecord.summary, 'Preserved secret record field');
	assert.equal(output.body.access_token, '[REDACTED]');
	assert.equal(output.body.url, 'http://127.0.0.1/storage/object/sign/records/file.pdf?token=[REDACTED]');
	assert.ok(!JSON.stringify(output).includes('private-signed-token'));
	assert.ok(!JSON.stringify(output).includes(fixture.actors.manager.password));
	assert.ok(output.redactedValues >= 4);
});

for (const family of ['leader-notes', 'documents']) {
	test(`${family} writes through a symlinked evidence root preserve payloads and canonical file sources`, async (t) => {
		const context = await inputs(t);
		const alias = path.join(context.root, 'evidence-alias');
		await fs.symlink(context.evidenceRoot, alias, 'dir');
		await fs.mkdir(path.join(context.evidenceRoot, 'bodies'));
		await fs.mkdir(path.join(context.evidenceRoot, 'uploads'));
		const bodyFile = path.join(alias, 'bodies', 'request.json');
		const bytes = Buffer.from('%PDF-1.7\nSynthetic alias upload\n');
		const payload = { title: 'Alias evidence', notes: 'Retained payload' };
		if (family === 'documents') {
			await fs.writeFile(path.join(context.evidenceRoot, 'uploads', 'actual.pdf'), bytes);
			payload.file = { path: path.join(alias, 'uploads', 'actual.pdf'), type: 'application/pdf', name: 'alias.pdf' };
		}
		await fs.writeFile(bodyFile, JSON.stringify(payload));
		const http = authenticated(async (url, options) => {
			assert.equal(url, `${origin}/org/${orgA}/api/personnel/${person}/${family}`);
			if (family === 'documents') {
				assert.equal(options.body.get('title'), payload.title);
				assert.equal(options.body.get('notes'), payload.notes);
				const file = options.body.get('file');
				assert.equal(file.name, 'alias.pdf');
				assert.equal(file.type, 'application/pdf');
				assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
			} else assert.deepEqual(JSON.parse(options.body), payload);
			return Response.json({ saved: true });
		});
		const output = await artifactHttp({
			...context,
			origin,
			fixture,
			evidenceRoot: alias,
			args: args('POST', family, bodyFile),
			...http
		});
		assert.equal(output.status, 200);
		assert.equal(output.request.source, path.join('bodies', 'request.json'));
		assert.deepEqual(output.request.body, {
			...payload,
			...(family === 'documents' ? { file: { ...payload.file, path: path.join('uploads', 'actual.pdf') } } : {})
		});
		if (family === 'documents') {
			assert.equal(output.request.upload.source, path.join('uploads', 'actual.pdf'));
			assert.equal(output.request.upload.bytes, bytes.length);
			assert.equal(output.request.upload.sha256, createHash('sha256').update(bytes).digest('hex'));
		}
	});
}

test('multipart uses exact evidence bytes with explicit MIME/name overrides and supports missing-file probes', async (t) => {
	const { evidenceRoot, bodyFile } = await inputs(t);
	const uploadFile = path.join(evidenceRoot, 'actual.txt');
	const bytes = Buffer.from('These bytes are deliberately not a PDF.');
	await fs.writeFile(uploadFile, bytes);
	await fs.writeFile(
		bodyFile,
		JSON.stringify({
			title: 'MIME guard',
			summary: 'Synthetic counseling',
			dateConducted: '2026-09-30',
			file: { path: uploadFile, type: 'Application/PDF', name: 'spoofed.pdf' }
		})
	);
	const http = authenticated(async (_url, options) => {
		assert.equal(options.headers.get('Content-Type'), null);
		assert.equal(options.headers.get('Origin'), origin);
		assert.equal(options.body.get('title'), 'MIME guard');
		const file = options.body.get('file');
		assert.equal(file.name, 'spoofed.pdf');
		assert.equal(file.type, 'application/pdf');
		assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
		return Response.json({ error: 'File contents do not match declared type' }, { status: 400 });
	});
	const output = await artifactHttp({
		origin,
		fixture,
		evidenceRoot,
		args: args('POST', 'counseling-records', bodyFile),
		...http
	});
	assert.equal(output.status, 400);
	assert.equal(output.request.upload.bytes, bytes.length);
	assert.equal(output.request.upload.sha256, createHash('sha256').update(bytes).digest('hex'));
	assert.equal(output.request.body.file.path, 'actual.txt');
	assert.equal(output.request.body.file.type, 'Application/PDF');
	assert.equal(output.request.upload.type, 'application/pdf');
	await fs.writeFile(bodyFile, JSON.stringify({ title: 'Missing file' }));
	const missing = authenticated((_url, options) => {
		assert.equal(options.body.get('file'), null);
		return Response.json({ error: 'Missing file' }, { status: 400 });
	});
	const noFile = await artifactHttp({
		origin,
		fixture,
		evidenceRoot,
		args: args('POST', 'documents', bodyFile),
		...missing
	});
	assert.deepEqual(noFile.request.body, { title: 'Missing file' });
});

test('DELETE and document downloads use only named routes, preserve redirects and never follow signed URLs', async () => {
	for (const [method, route] of [
		['DELETE', `leader-notes/${record}`],
		['GET', `documents/${record}/download`]
	]) {
		const http = authenticated((_url, options) => {
			assert.equal(options.method, method);
			assert.equal(options.body, undefined);
			return redirect('/auth/login', []);
		});
		const output = await artifactHttp({ origin, fixture, args: args(method, route), ...http });
		assert.equal(http.calls.length, 3);
		assert.equal(output.status, 303);
		assert.equal(output.location, '/auth/login');
	}
	const http = authenticated(() => Response.json({ url: 'https://private-storage.invalid/file?token=private-token' }));
	const output = await artifactHttp({ origin, fixture, args: args('GET', `documents/${record}/download`), ...http });
	assert.equal(http.calls.length, 3);
	assert.equal(output.body.url, 'https://private-storage.invalid/file?token=[REDACTED]');
});

test('cross-origin redirects and network exception details are blocked without exposing credentials', async () => {
	for (const location of [
		'https://example.invalid/path?token=private-token',
		'//example.invalid/path',
		'http://user:password@127.0.0.1:43210/dashboard'
	]) {
		let calls = 0;
		await assert.rejects(
			artifactHttp({
				origin,
				fixture,
				args: args(),
				fetchImpl: async () => {
					calls++;
					return redirect(location);
				}
			}),
			/redirect outside/
		);
		assert.equal(calls, 1);
	}
	await assert.rejects(
		artifactHttp({
			origin,
			fixture,
			args: args(),
			fetchImpl: () => {
				throw new Error(fixture.actors.manager.password);
			}
		}),
		(error) => error.message === 'Owned app HTTP request failed.'
	);
});

test('repeated actor requests reuse one normal login, confirm each action, persist cookie rotation and redact loaded secrets', async (t) => {
	const context = await inputs(t);
	let logins = 0;
	let confirmations = 0;
	let actions = 0;
	const fetchImpl = async (url, options) => {
		if (url.endsWith('/auth/login?/login')) {
			logins++;
			return redirect();
		}
		if (url.endsWith('/auth/login')) {
			confirmations++;
			if (confirmations === 2) {
				assert.equal(options.headers.get('Cookie'), 'session.0=rotated-private-chunk');
				return redirect('/dashboard', ['session.0=confirmed-private-chunk; Path=/']);
			}
			return redirect('/dashboard', []);
		}
		actions++;
		if (actions === 1) {
			const headers = new Headers();
			headers.append('Set-Cookie', 'session.0=rotated-private-chunk; Path=/');
			headers.append('Set-Cookie', 'session.1=; Max-Age=0; Path=/');
			return Response.json({ title: 'First action' }, { headers });
		}
		assert.equal(options.headers.get('Cookie'), 'session.0=confirmed-private-chunk');
		return Response.json({ title: 'Private field remains', echo: options.headers.get('Cookie') });
	};
	const first = await artifactHttp({ ...context, origin, fixture, args: args(), fetchImpl });
	const second = await artifactHttp({ ...context, origin, fixture, args: args('GET', 'follow-ups'), fetchImpl });
	const third = await artifactHttp({
		...context,
		origin,
		fixture,
		args: args('GET', `documents/${record}/download`),
		fetchImpl
	});
	assert.equal(logins, 1);
	assert.equal(confirmations, 3);
	assert.equal(actions, 3);
	assert.equal(first.authentication.mode, 'normal');
	assert.equal(first.authentication.loginStatus, 303);
	assert.equal(second.authentication.mode, 'reused');
	assert.equal(second.authentication.loginStatus, null);
	assert.equal(third.body.title, 'Private field remains');
	assert.ok(!JSON.stringify(third).includes('confirmed-private-chunk'));
	const base = path.join(context.session, 'artifact-http-sessions');
	const directory = path.join(base, sessionId);
	const file = path.join(directory, `${fixture.actors.manager.id}.json`);
	assert.equal((await fs.stat(base)).mode & 0o777, 0o700);
	assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
	assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
	const cached = JSON.parse(await fs.readFile(file, 'utf8'));
	assert.equal(cached.cookies.length, 1);
	assert.equal(cached.cookies[0].value, 'confirmed-private-chunk');
	assert.ok(!JSON.stringify(cached).includes(fixture.actors.manager.password));
});

test('invalid cached authentication clears cookies and allows exactly one fresh form login before the action', async (t) => {
	const context = await inputs(t);
	await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		...authenticated(() => Response.json({ success: true }))
	});
	const sequence = [];
	const output = await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		fetchImpl: async (url, options) => {
			sequence.push(url);
			if (sequence.length === 1) {
				assert.ok(options.headers.get('Cookie'));
				return new Response(null, { status: 401 });
			}
			if (sequence.length === 2) {
				assert.equal(options.headers.get('Cookie'), null);
				assert.equal(options.method, 'POST');
				return redirect('/dashboard', ['session.0=fresh-private-session; Path=/']);
			}
			if (sequence.length === 3) return redirect('/dashboard', []);
			assert.equal(options.headers.get('Cookie'), 'session.0=fresh-private-session');
			return Response.json({ success: true });
		}
	});
	assert.deepEqual(sequence, [
		`${origin}/auth/login`,
		`${origin}/auth/login?/login`,
		`${origin}/auth/login`,
		`${origin}${endpoint}`
	]);
	assert.deepEqual(output.authentication, {
		mode: 'normal',
		loginStatus: 303,
		confirmationStatus: 303,
		previousConfirmationStatus: 401
	});
	const file = path.join(context.session, 'artifact-http-sessions', sessionId, `${fixture.actors.manager.id}.json`);
	const cache = JSON.parse(await fs.readFile(file, 'utf8'));
	cache.cookies.forEach((cookie) => {
		cookie.expires = Date.now() - 1000;
	});
	await fs.writeFile(file, JSON.stringify(cache));
	const fresh = authenticated(() => Response.json({ success: true }));
	const expired = await artifactHttp({ ...context, origin, fixture, args: args(), ...fresh });
	assert.equal(fresh.calls[0].url, `${origin}/auth/login?/login`);
	assert.equal(fresh.calls[0].headers.get('Cookie'), null);
	assert.equal(expired.authentication.mode, 'normal');
});

test('cache binding changes cannot reuse another worker, origin or actor session', async (t) => {
	const context = await inputs(t);
	await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		...authenticated(() => Response.json({ success: true }))
	});
	const file = path.join(context.session, 'artifact-http-sessions', sessionId, `${fixture.actors.manager.id}.json`);
	for (const [key, value] of [
		['sessionId', '50000000-0000-4000-8000-000000000002'],
		['origin', 'http://127.0.0.1:43211'],
		['actorId', '40000000-0000-4000-8000-000000000002']
	]) {
		const cached = JSON.parse(await fs.readFile(file, 'utf8'));
		await fs.writeFile(file, JSON.stringify({ ...cached, [key]: value }));
		const fresh = authenticated(() => Response.json({ success: true }));
		const output = await artifactHttp({ ...context, origin, fixture, args: args(), ...fresh });
		assert.equal(fresh.calls[0].url, `${origin}/auth/login?/login`);
		assert.equal(fresh.calls[0].headers.get('Cookie'), null);
		assert.equal(output.authentication.mode, 'normal');
	}
	const secondFixture = {
		...fixture,
		actors: {
			...fixture.actors,
			viewer: { ...fixture.actors.manager, id: '40000000-0000-4000-8000-000000000002', email: 'viewer@example.invalid' }
		}
	};
	const viewer = authenticated(() => Response.json({ success: true }));
	const output = await artifactHttp({
		...context,
		origin,
		fixture: secondFixture,
		args: ['viewer', 'orgA', person, 'GET', 'leader-notes'],
		...viewer
	});
	assert.equal(viewer.calls[0].headers.get('Cookie'), null);
	assert.equal(output.authentication.mode, 'normal');
	const reused = await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		fetchImpl: async (url) =>
			url.endsWith('/auth/login') ? redirect('/dashboard', []) : Response.json({ success: true })
	});
	assert.equal(reused.authentication.mode, 'reused');
});

test('unavailable cached confirmation preserves the session without login or artifact requests and permits later reuse', async (t) => {
	const context = await inputs(t);
	await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		...authenticated(() => Response.json({ success: true }))
	});
	const file = path.join(context.session, 'artifact-http-sessions', sessionId, `${fixture.actors.manager.id}.json`);
	const saved = await fs.readFile(file, 'utf8');
	for (const status of [429, 503]) {
		let calls = 0;
		await assert.rejects(
			artifactHttp({
				...context,
				origin,
				fixture,
				args: args(),
				fetchImpl: async (url, options) => {
					calls++;
					assert.equal(url, `${origin}/auth/login`);
					assert.equal(options.method, 'GET');
					return new Response(null, { status, headers: { 'Retry-After': '45' } });
				}
			}),
			(error) => error.message.includes(`HTTP ${status}`) && error.message.includes('Retry after 45 seconds')
		);
		assert.equal(calls, 1);
		assert.equal(await fs.readFile(file, 'utf8'), saved);
	}
	const sequence = [];
	const output = await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		fetchImpl: async (url) => {
			sequence.push(url);
			return url.endsWith('/auth/login') ? redirect('/dashboard', []) : Response.json({ success: true });
		}
	});
	assert.deepEqual(sequence, [`${origin}/auth/login`, `${origin}${endpoint}`]);
	assert.equal(output.authentication.mode, 'reused');
	assert.equal(output.authentication.loginStatus, null);
});

test('unsafe cache files and symlink directories block before requests; cleanup removes only the named worker cache', async (t) => {
	const context = await inputs(t);
	await artifactHttp({
		...context,
		origin,
		fixture,
		args: args(),
		...authenticated(() => Response.json({ success: true }))
	});
	const directory = path.join(context.session, 'artifact-http-sessions', sessionId);
	const file = path.join(directory, `${fixture.actors.manager.id}.json`);
	await fs.chmod(file, 0o644);
	const fetchImpl = () => {
		assert.fail('Unsafe private cache must not make an app request.');
	};
	await assert.rejects(artifactHttp({ ...context, origin, fixture, args: args(), fetchImpl }), /unsafe permissions/);
	await fs.unlink(file);
	const outside = path.join(context.evidenceRoot, 'public.json');
	await fs.writeFile(outside, '{}');
	await fs.symlink(outside, file);
	await assert.rejects(
		artifactHttp({ ...context, origin, fixture, args: args(), fetchImpl }),
		/Private artifact session file/
	);
	const anotherId = '50000000-0000-4000-8000-000000000002';
	await artifactHttp({
		...context,
		sessionId: anotherId,
		origin,
		fixture,
		args: args(),
		...authenticated(() => Response.json({ success: true }))
	});
	await clearArtifactHttpCache({ session: context.session, sessionId });
	await assert.rejects(fs.access(directory), { code: 'ENOENT' });
	assert.equal(await fs.readFile(outside, 'utf8'), '{}');
	assert.ok((await fs.stat(path.join(context.session, 'artifact-http-sessions', anotherId))).isDirectory());
	await fs.symlink(context.evidenceRoot, directory);
	await assert.rejects(
		artifactHttp({ ...context, origin, fixture, args: args(), fetchImpl }),
		/Private artifact session directory/
	);
});

test('public retry pacing is recorded without an automatic login or mutation retry', async () => {
	const http = authenticated(() =>
		Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '45' } })
	);
	const output = await artifactHttp({ origin, fixture, args: args(), ...http });
	assert.equal(output.status, 429);
	assert.equal(output.retryAfter, '45');
	assert.equal(http.calls.length, 3);
	let calls = 0;
	await assert.rejects(
		artifactHttp({
			origin,
			fixture,
			args: args(),
			fetchImpl: async () => {
				calls++;
				return new Response(null, { status: 429, headers: { 'Retry-After': '900' } });
			}
		}),
		/HTTP 429.*Retry after 900 seconds/
	);
	assert.equal(calls, 1);
});

test('short preferences preserve complete evidence in normal and reused sessions while short passwords and credentials stay redacted', async (t) => {
	const context = await inputs(t);
	const shortPasswordFixture = {
		...fixture,
		actors: { manager: { ...fixture.actors.manager, password: 'pw' } }
	};
	let logins = 0;
	const fetchImpl = async (url) => {
		if (url.endsWith('/auth/login?/login')) {
			logins++;
			return redirect('/dashboard', ['preference=en; Path=/', 'session.0=auth0008; Path=/; HttpOnly']);
		}
		if (url.endsWith('/auth/login')) return redirect('/dashboard', []);
		return Response.json({
			title: 'Personnel evidence',
			description: 'Full sensitive field remains visible',
			preference: 'en',
			echoedPassword: 'pw',
			echoedSession: 'auth0008',
			access_token: 'private-access',
			headers: { Authorization: 'Bearer private-bearer', Cookie: 'preference=en; session.0=auth0008' },
			bearer: 'Bearer opaque-credential',
			identity: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl',
			url: 'https://private-storage.invalid/file.pdf?token=private-signed-token'
		});
	};
	const normal = await artifactHttp({ ...context, origin, fixture: shortPasswordFixture, args: args(), fetchImpl });
	const reused = await artifactHttp({ ...context, origin, fixture: shortPasswordFixture, args: args(), fetchImpl });
	assert.equal(logins, 1);
	assert.deepEqual(
		[normal.body, reused.body],
		Array.from({ length: 2 }, () => ({
			title: 'Personnel evidence',
			description: 'Full sensitive field remains visible',
			preference: 'en',
			echoedPassword: '[REDACTED]',
			echoedSession: '[REDACTED]',
			access_token: '[REDACTED]',
			headers: { Authorization: '[REDACTED]', Cookie: '[REDACTED]' },
			bearer: 'Bearer [REDACTED]',
			identity: '[REDACTED]',
			url: 'https://private-storage.invalid/file.pdf?token=[REDACTED]'
		}))
	);
	assert.deepEqual([normal.authentication.mode, reused.authentication.mode], ['normal', 'reused']);
});

test('short passwords colliding with credential syntax cannot expose signed, Bearer or JWT values', async (t) => {
	const observations = [];
	for (const password of ['en', 'Bearer', 'eyJ']) {
		const context = await inputs(t);
		const collisionFixture = { ...fixture, actors: { manager: { ...fixture.actors.manager, password } } };
		const http = authenticated(() =>
			Response.json({
				url: 'https://private-storage.invalid/file.pdf?token=opaque-signed-value',
				bearer: 'Bearer opaque-bearer-value',
				jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl',
				echo: password,
				access_token: 'opaque-access-value',
				headers: { Authorization: 'Bearer opaque-header-value' }
			})
		);
		const output = await artifactHttp({ ...context, origin, fixture: collisionFixture, args: args(), ...http });
		observations.push({
			url: output.body.url,
			bearer: output.body.bearer,
			jwt: output.body.jwt,
			echo: output.body.echo
		});
		assert.equal(output.body.headers.Authorization, '[REDACTED]');
		assert.ok(!JSON.stringify(output).includes('opaque-access-value'));
	}
	assert.deepEqual(observations, [
		{
			url: 'https://private-storage.invalid/file.pdf?tok[REDACTED]=[REDACTED]',
			bearer: 'Bearer [REDACTED]',
			jwt: '[REDACTED]',
			echo: '[REDACTED]'
		},
		{
			url: 'https://private-storage.invalid/file.pdf?token=[REDACTED]',
			bearer: '[REDACTED] [REDACTED]',
			jwt: '[REDACTED]',
			echo: '[REDACTED]'
		},
		{
			url: 'https://private-storage.invalid/file.pdf?token=[REDACTED]',
			bearer: 'Bearer [REDACTED]',
			jwt: '[REDACTED]',
			echo: '[REDACTED]'
		}
	]);
});
