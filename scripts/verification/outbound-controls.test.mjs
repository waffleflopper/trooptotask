import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	createMailSink,
	createProviderFaultController,
	openCapturedLink,
	redactLinkTokens
} from './outbound-controls.mjs';

const apiKey = 'a1'.repeat(24);
const providerUrl = 'http://127.0.0.1:56321';
const rawToken = 'RAW_SETUP_TOKEN_9f8e7d';
const setupUrl = `http://127.0.0.1:4100/auth/setup-account?token=${rawToken}`;
const renewUrl = 'http://127.0.0.1:4100/auth/renew-invite?email=new%40example.test';

function mailRequest({ to = ['New@Example.test'], subject, text, key = apiKey } = {}) {
	return [
		'https://api.resend.com/emails',
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: 'verify@example.test', to, subject, text, html: `<p>${text}</p>` })
		}
	];
}
const setupMail = (options) =>
	mailRequest({
		subject: 'Set up your TroopToTask account',
		text: `Set up your account here: ${setupUrl}\n`,
		...options
	});
const inviteMail = (options) =>
	mailRequest({
		subject: 'Invitation to join Alpha on TroopToTask',
		text: `Because you do not have an account yet:\nRequest a link ${renewUrl}\nUse that only if needed.`,
		...options
	});

function sink() {
	const passed = [];
	const mail = createMailSink({
		apiKey,
		fetch: async (...args) => {
			passed.push(args);
			return new Response('real');
		}
	});
	return { mail, passed };
}

test('captures each message with a synthetic success and classifies it from its content', async () => {
	const { mail, passed } = sink();
	const first = await mail.fetch(...setupMail());
	assert.equal(first.status, 200);
	assert.deepEqual(await first.json(), { id: 'synthetic-mail-1' });
	assert.equal((await mail.fetch(...inviteMail())).status, 200);
	assert.equal(passed.length, 0);
	const { messages, armed } = mail.command('mail-state');
	assert.equal(armed, null);
	assert.deepEqual(
		messages.map(({ sequence, to, subject, kind, delivery, paths }) => ({
			sequence,
			to,
			subject,
			kind,
			delivery,
			paths
		})),
		[
			{
				sequence: 1,
				to: ['new@example.test'],
				subject: 'Set up your TroopToTask account',
				kind: 'account-setup',
				delivery: 'delivered',
				paths: ['/auth/setup-account?token=[redacted]']
			},
			{
				sequence: 2,
				to: ['new@example.test'],
				subject: 'Invitation to join Alpha on TroopToTask',
				kind: 'invitation',
				delivery: 'delivered',
				paths: ['/auth/renew-invite?email=new%40example.test']
			}
		]
	);
	assert.match(messages[0].receivedAt, /^\d{4}-\d\d-\d\dT/);
	assert.equal(JSON.stringify(mail.command('mail-state')).includes(rawToken), false);
});

test('mail-link returns the newest delivered link of that kind for that recipient only', async () => {
	const { mail } = sink();
	await mail.fetch(...setupMail());
	await mail.fetch(...setupMail({ to: ['other@example.test'] }));
	const newest = `http://127.0.0.1:4100/auth/setup-account?token=${rawToken}-newest`;
	await mail.fetch(...mailRequest({ subject: 'Set up', text: `Set up your account here: ${newest}\n` }));
	assert.equal(mail.command('mail-link', { email: ' NEW@example.test ', kind: 'account-setup' }).link, newest);
	assert.equal(
		mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup', ordinal: 2 }).link,
		setupUrl
	);
	assert.equal(
		mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup', ordinal: 3 }).status,
		'BLOCKED'
	);
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'invitation' }).status, 'BLOCKED');
	await mail.fetch(...inviteMail());
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'invitation' }).link, renewUrl);
	assert.throws(() => mail.command('mail-link', { email: 'new@example.test', kind: 'setup' }));
	assert.throws(() => mail.command('mail-link', { email: 'new@example.test', kind: 'invitation', ordinal: 11 }));
});

test('an armed failure returns a synthetic 503 for the matching kind and count, then delivers again', async () => {
	const { mail } = sink();
	mail.command('mail-arm', { mode: 'fail', kind: 'account-setup', count: 2 });
	assert.throws(() => mail.command('mail-arm', { mode: 'fail' }));
	assert.equal((await mail.fetch(...inviteMail())).status, 200);
	for (let attempt = 0; attempt < 2; attempt++) {
		const failure = await mail.fetch(...setupMail());
		assert.equal(failure.status, 503);
		assert.equal((await failure.json()).message, 'Synthetic verification mail failure');
	}
	assert.equal((await mail.fetch(...setupMail())).status, 200);
	const { messages, armed } = mail.command('mail-state');
	assert.deepEqual(
		messages.map(({ kind, delivery }) => `${kind}:${delivery}`),
		['invitation:delivered', 'account-setup:failed', 'account-setup:failed', 'account-setup:delivered']
	);
	assert.deepEqual(armed, { kind: 'account-setup', remaining: 0, failed: 2 });
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'account-setup' }).sequence, 4);
	assert.equal(mail.command('mail-restore').armed, null);
});

test('restore clears an armed failure before it fires; invalid arming is refused', async () => {
	const { mail } = sink();
	for (const options of [
		{},
		{ mode: 'fail', kind: 'confirm' },
		{ mode: 'fail', count: 0 },
		{ mode: 'fail', count: 11 }
	])
		assert.throws(() => mail.command('mail-arm', options));
	mail.command('mail-arm', { mode: 'fail' });
	mail.command('mail-restore');
	assert.equal((await mail.fetch(...setupMail())).status, 200);
});

test('only the exact Resend send with the owned bearer is intercepted', async () => {
	const { mail, passed } = sink();
	mail.command('mail-arm', { mode: 'fail', count: 10 });
	const ordinary = [
		setupMail({ key: 'b2'.repeat(24) }),
		['https://api.resend.com/emails', { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/domains', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/emails?x=1', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://example.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['http://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }],
		['https://api.resend.com/emails', { method: 'POST' }],
		[`${providerUrl}/rest/v1/organizations`]
	];
	for (const input of ordinary) assert.equal(await (await mail.fetch(...input)).text(), 'real');
	assert.equal(passed.length, ordinary.length);
	assert.deepEqual(mail.command('mail-state').messages, []);
});

test('an unreadable message with the owned bearer is rejected locally and never recorded', async () => {
	const { mail, passed } = sink();
	const response = await mail.fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${apiKey}` },
		body: 'not json'
	});
	assert.equal(response.status, 422);
	assert.equal(passed.length, 0);
	assert.deepEqual(mail.command('mail-state').messages, []);
});

test('redactLinkTokens hides every secret-bearing parameter and leaves other values readable', () => {
	assert.equal(
		redactLinkTokens('/auth/confirm?type=invite&token_hash=abc&next=%2Fauth%2Faccept-invite#access_token=def'),
		'/auth/confirm?type=invite&token_hash=[redacted]&next=%2Fauth%2Faccept-invite#access_token=[redacted]'
	);
	assert.equal(
		redactLinkTokens('/auth/renew-invite?email=a%40example.test'),
		'/auth/renew-invite?email=a%40example.test'
	);
});

const providerInput = (table, init) => [`${providerUrl}/rest/v1/${table}`, init];
function faults() {
	const passed = [];
	const control = createProviderFaultController({
		providerUrl,
		fetch: async (...args) => {
			passed.push(args);
			return new Response('real');
		}
	});
	return { control, passed };
}

test('each named fault matches only its allowlisted writes on the owned provider', async () => {
	const cases = {
		'setup-link-create': [
			[providerInput('account_setup_links', { method: 'POST' }), ['POST', '/rest/v1/account_setup_links']],
			[
				providerInput('rpc/issue_account_setup_link', { method: 'POST' }),
				['POST', '/rest/v1/rpc/issue_account_setup_link']
			]
		],
		'invitation-access-link': [
			[
				providerInput('access_request_organization_invitation_links', { method: 'POST' }),
				['POST', '/rest/v1/access_request_organization_invitation_links']
			],
			[
				providerInput('rpc/link_organization_invitation_access_request', { method: 'POST' }),
				['POST', '/rest/v1/rpc/link_organization_invitation_access_request']
			]
		],
		'invitation-block': [
			[
				providerInput('organization_invitations', { method: 'PATCH', body: JSON.stringify({ status: 'blocked' }) }),
				['PATCH', '/rest/v1/organization_invitations']
			]
		]
	};
	for (const [name, matching] of Object.entries(cases)) {
		for (const [input, [method, path]] of matching) {
			const { control, passed } = faults();
			control.command('fault-arm', { name });
			const response = await control.fetch(...input);
			assert.equal(response.status, 503);
			assert.equal((await response.json()).code, 'T2T_VERIFY_PROVIDER_FAULT');
			assert.equal(passed.length, 0);
			assert.deepEqual(control.command('fault-state').controls[name].call, { method, path });
		}
	}
});

test('other writes, reads, origins and foreign operations pass through without counting', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'invitation-block' });
	const ordinary = [
		providerInput('organization_invitations', { method: 'PATCH', body: JSON.stringify({ status: 'revoked' }) }),
		providerInput('organization_invitations', { method: 'PATCH', body: 'not json' }),
		providerInput('organization_invitations', { method: 'PATCH' }),
		providerInput('organization_invitations', { method: 'GET' }),
		providerInput('organization_invitations', { method: 'POST', body: JSON.stringify({ status: 'blocked' }) }),
		providerInput('account_setup_links', { method: 'POST' }),
		providerInput('rpc/issue_account_setup_link', { method: 'POST' }),
		[
			`${providerUrl.replace(':56321', ':56322')}/rest/v1/organization_invitations`,
			{ method: 'PATCH', body: '{"status":"blocked"}' }
		],
		[
			`${providerUrl.replace('http://', 'http://user:password@')}/rest/v1/organization_invitations`,
			{ method: 'PATCH', body: '{"status":"blocked"}' }
		],
		['https://example.com/rest/v1/organization_invitations', { method: 'PATCH', body: '{"status":"blocked"}' }],
		[new Request(`${providerUrl}/rest/v1/organization_invitations`, { method: 'PATCH', body: '{"status":"revoked"}' })]
	];
	for (const input of ordinary) assert.equal(await (await control.fetch(...input)).text(), 'real');
	assert.equal(passed.length, ordinary.length);
	assert.equal(control.command('fault-state').controls['invitation-block'].matches, 0);
	const blocked = new Request(`${providerUrl}/rest/v1/organization_invitations`, {
		method: 'PATCH',
		body: JSON.stringify({ status: 'blocked' })
	});
	assert.equal((await control.fetch(blocked)).status, 503);
});

test('a fault fires on the selected ordinal once and stays dormant until restored and re-armed', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'setup-link-create', ordinal: 2 });
	assert.throws(() => control.command('fault-arm', { name: 'setup-link-create' }));
	const create = providerInput('account_setup_links', { method: 'POST' });
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal((await control.fetch(...create)).status, 503);
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal(passed.length, 2);
	const state = control.command('fault-state');
	assert.deepEqual(state.armed, []);
	assert.deepEqual(state.controls['setup-link-create'], {
		ordinal: 2,
		matches: 2,
		phase: 'faulted',
		call: { method: 'POST', path: '/rest/v1/account_setup_links' }
	});
	control.command('fault-restore');
	assert.deepEqual(control.command('fault-state').controls, {});
	assert.equal(control.command('fault-state').lastControls['setup-link-create'].phase, 'faulted');
	control.command('fault-arm', { name: 'setup-link-create' });
	assert.equal((await control.fetch(...create)).status, 503);
});

test('restore before the ordinal leaves later writes untouched; invalid arming is refused', async () => {
	const { control } = faults();
	for (const options of [
		{ name: 'account-setup' },
		{ name: 'setup-link-create', ordinal: 0 },
		{ name: 'setup-link-create', ordinal: 11 },
		{ name: 'setup-link-create', ordinal: 1.5 },
		{ name: 'constructor' }
	])
		assert.throws(() => control.command('fault-arm', options));
	control.command('fault-arm', { name: 'setup-link-create', ordinal: 2 });
	const create = providerInput('account_setup_links', { method: 'POST' });
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.deepEqual(control.command('fault-restore').armed, []);
	assert.equal(await (await control.fetch(...create)).text(), 'real');
	assert.equal(control.command('fault-state').lastControls['setup-link-create'].phase, 'restored');
	assert.throws(
		() => createProviderFaultController({ providerUrl: 'http://localhost:56321', fetch }),
		/exact owned loopback provider origin/
	);
});

test('the actual Node preloader captures mail, serves its link only over the authenticated endpoint and faults one write', async (t) => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-outbound-control-test-'));
	await fs.chmod(session, 0o700);
	const requests = [];
	const provider = createServer((request, response) => {
		requests.push(`${request.method} ${request.url}`);
		response.end('actual fixture write');
	});
	await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
	const config = {
		sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		token: 'd'.repeat(64),
		mailApiKey: apiKey,
		providerUrl: `http://127.0.0.1:${provider.address().port}`,
		orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
	};
	const configFile = path.join(session, 'control.json');
	await fs.writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
	const preload = new URL('./server-source-control.mjs', import.meta.url);
	preload.searchParams.set('config', configFile);
	const child = spawn(
		process.execPath,
		[
			'--import',
			preload.href,
			'--input-type=module',
			'-e',
			`import { createInterface } from 'node:readline';
			const lines = createInterface({ input: process.stdin });
			process.stdout.write('ready\\n');
			for await (const line of lines) {
				const { url, init } = JSON.parse(line);
				const response = await fetch(url, init);
				process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }) + '\\n');
			}`
		],
		{ stdio: ['pipe', 'pipe', 'pipe'] }
	);
	let output = '';
	let diagnostic = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (diagnostic += chunk));
	t.after(async () => {
		if (child.exitCode === null) {
			const exited = once(child, 'exit');
			child.kill('SIGKILL');
			await exited;
		}
		await new Promise((resolve) => provider.close(resolve));
		await fs.rm(session, { recursive: true, force: true });
	});
	async function waitFor(predicate) {
		for (let attempt = 0; attempt < 200; attempt++) {
			if (predicate()) return;
			assert.equal(child.exitCode, null, diagnostic);
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.fail(`Preloader did not reach its expected state: ${diagnostic}`);
	}
	await waitFor(() => output.includes('ready\n'));
	const ready = JSON.parse(await fs.readFile(path.join(session, 'server-source-control-ready.json'), 'utf8'));
	const endpoint = `http://127.0.0.1:${ready.port}`;
	async function command(action, options = {}, token = config.token) {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
			body: JSON.stringify({ action, ...options })
		});
		return response.status === 403 ? { status: 403 } : response.json();
	}
	let seen = 0;
	async function send(url, init) {
		const results = () => output.split('\n').filter((line) => line.startsWith('{'));
		const expected = ++seen;
		child.stdin.write(`${JSON.stringify({ url, init })}\n`);
		await waitFor(() => results().length === expected);
		return JSON.parse(results().at(-1));
	}
	const [url, init] = setupMail();
	assert.equal((await command('mail-state', {}, 'e'.repeat(64))).status, 403);
	assert.equal((await send(url, init)).status, 200);
	const state = await command('mail-state');
	assert.equal(state.messages[0].kind, 'account-setup');
	assert.equal(JSON.stringify(state).includes(rawToken), false);
	assert.equal((await command('mail-link', { email: 'new@example.test', kind: 'account-setup' })).link, setupUrl);
	await command('mail-arm', { mode: 'fail' });
	assert.equal((await send(url, init)).status, 503);
	assert.equal((await send(url, init)).status, 200);
	assert.equal(requests.length, 0);

	const write = `${config.providerUrl}/rest/v1/account_setup_links`;
	await command('fault-arm', { name: 'setup-link-create' });
	assert.equal((await send(write, { method: 'POST', body: '{}' })).status, 503);
	assert.equal((await send(write, { method: 'POST', body: '{}' })).body, 'actual fixture write');
	assert.deepEqual(requests, ['POST /rest/v1/account_setup_links']);
	assert.equal((await command('fault-state')).controls['setup-link-create'].phase, 'faulted');
	assert.equal(diagnostic, '');
	assert.equal(JSON.stringify(ready).includes(config.token), false);
	assert.equal(JSON.stringify(ready).includes(apiKey), false);
});

test('auth confirmation mail is its own kind and its token hash is redacted', async () => {
	const { mail } = sink();
	const confirm = `http://127.0.0.1:4100/auth/confirm?token_hash=${rawToken}&type=recovery`;
	await mail.fetch(...mailRequest({ subject: 'Reset your password', text: `Reset here: ${confirm}\n` }));
	const [message] = mail.command('mail-state').messages;
	assert.equal(message.kind, 'auth');
	assert.deepEqual(message.paths, ['/auth/confirm?token_hash=[redacted]&type=recovery']);
	assert.equal(mail.command('mail-link', { email: 'new@example.test', kind: 'auth' }).link, confirm);
});

test('issuance and cleanup faults compose: each fails its own write once', async () => {
	const { control, passed } = faults();
	control.command('fault-arm', { name: 'setup-link-create' });
	control.command('fault-arm', { name: 'invitation-block' });
	assert.deepEqual(control.command('fault-state').armed, ['setup-link-create', 'invitation-block']);
	const block = providerInput('organization_invitations', {
		method: 'PATCH',
		body: JSON.stringify({ status: 'blocked' })
	});
	assert.equal((await control.fetch(...providerInput('account_setup_links', { method: 'POST' }))).status, 503);
	assert.equal((await control.fetch(...block)).status, 503);
	assert.equal(await (await control.fetch(...block)).text(), 'real');
	assert.equal(passed.length, 1);
	assert.deepEqual(
		Object.fromEntries(Object.entries(control.command('fault-state').controls).map(([name, { call }]) => [name, call])),
		{
			'setup-link-create': { method: 'POST', path: '/rest/v1/account_setup_links' },
			'invitation-block': { method: 'PATCH', path: '/rest/v1/organization_invitations' }
		}
	);
});

test('opening a captured link never surfaces its token, even when DevTools fails', async () => {
	const origin = 'http://127.0.0.1:4100';
	const captured = { sequence: 3, link: `${origin}/auth/setup-account?token=${rawToken}` };
	const textContent = (result) => result;
	const failing = (failOn) => async (name, args) => {
		if (name === failOn) throw new Error(`navigate failed for ${args.url ?? captured.link}`);
		return name === 'take_snapshot' ? 'Choose your password' : null;
	};
	for (const failOn of ['navigate_page', 'take_snapshot']) {
		const error = await openCapturedLink({ captured, origin, pageId: 2, call: failing(failOn), textContent }).catch(
			(caught) => caught
		);
		assert.equal(error.message.includes(rawToken), false);
		assert.match(error.message, /withheld/);
	}
	await assert.rejects(
		openCapturedLink({ captured, origin: 'http://127.0.0.1:9999', pageId: 2, call: failing(), textContent }),
		/not on the owned app origin/
	);
	const leaky = async (name) => (name === 'take_snapshot' ? `url=${captured.link.replace('token=', 'TOKEN=')}` : null);
	await assert.rejects(
		openCapturedLink({
			captured,
			origin,
			pageId: 2,
			call: leaky,
			textContent: (result) => result.replace('TOKEN=', 'x=')
		}),
		/refusing to print/
	);
	assert.deepEqual(await openCapturedLink({ captured, origin, pageId: 2, call: failing(), textContent }), {
		sequence: 3,
		path: '/auth/setup-account',
		snapshot: 'Choose your password'
	});
});
