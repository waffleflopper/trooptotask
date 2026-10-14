import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServerSourceController } from './server-source-control.mjs';

const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const providerUrl = 'http://127.0.0.1:56321';
const target = `${providerUrl}/rest/v1/personnel_trainings?organization_id=eq.${orgA}`;
const turn = () => new Promise(setImmediate);
function deferred() {
	let resolve;
	const promise = new Promise((done) => (resolve = done));
	return { promise, resolve };
}
function controller(fetch = async () => new Response('saved source facts')) {
	return createServerSourceController({ providerUrl, orgId: orgA, fetch });
}

test('refuses foreign origins, invalid organizations and unbounded or competing controls', () => {
	for (const provider of [
		'https://example.com',
		'http://localhost:56321',
		`${providerUrl}/rest/v1`,
		`${providerUrl}?x=1`
	])
		assert.throws(() => createServerSourceController({ providerUrl: provider, orgId: orgA, fetch }));
	assert.throws(() => createServerSourceController({ providerUrl, orgId: 'orgA', fetch }));
	const control = controller();
	for (const options of [
		{ table: 'organization_memberships', mode: 'fail' },
		{ table: 'personnel_trainings', mode: 'write' },
		{ table: 'personnel_trainings', mode: 'hold', ordinal: 0 },
		{ table: 'personnel_trainings', mode: 'hold', ordinal: 11 },
		{ table: 'personnel_trainings', mode: 'hold', holdMs: Infinity },
		{ table: 'personnel_trainings', mode: 'hold', holdMs: 120001 }
	])
		assert.throws(() => control.command('arm', options));
	control.command('arm', { table: 'personnel_trainings', mode: 'fail' });
	assert.throws(() => control.command('arm', { table: 'availability_entries', mode: 'hold' }));
	control.command('restore');
});

test('fails only the selected exact A GET; B, auth, other tables, origins and writes pass through', async () => {
	const dispatched = [];
	const control = controller(async (...args) => {
		dispatched.push(args);
		return new Response('real');
	});
	control.command('arm', { table: 'personnel_trainings', mode: 'fail' });
	const ordinary = [
		[target.replace(orgA, orgB)],
		[target.replace('personnel_trainings', 'rating_scheme_entries')],
		[target.replace('/rest/v1/personnel_trainings', '/auth/v1/user')],
		[target.replace(':56321', ':56322')],
		[target.replace('http://', 'http://user:password@')],
		[`${target}&organization_id=eq.${orgB}`],
		[target.replace(`eq.${orgA}`, `in.(${orgA},${orgB})`)],
		[target, { method: 'POST' }],
		[new Request(target, { method: 'GET' }), { method: 'DELETE' }]
	];
	for (const input of ordinary) assert.equal(await (await control.fetch(...input)).text(), 'real');
	assert.equal(dispatched.length, ordinary.length);
	assert.equal(control.command('state').control.matches, 0);
	const response = await control.fetch(new Request(target), { headers: { Authorization: 'Bearer secret-token' } });
	assert.equal(response.status, 503);
	assert.equal((await response.json()).code, 'T2T_VERIFY_SOURCE_FAILURE');
	assert.equal(dispatched.length, ordinary.length);
	assert.equal(await (await control.fetch(target)).text(), 'real');
	const receipt = JSON.stringify(control.command('state'));
	assert.equal(receipt.includes('secret-token'), false);
	assert.equal(receipt.includes('Authorization'), false);
	control.command('restore');
});

test('dispatches the actual source before holding and releases its unchanged response', async () => {
	const provider = deferred();
	let dispatched = false;
	const originalResponse = new Response('source value', { status: 206 });
	const control = controller(() => {
		dispatched = true;
		return provider.promise;
	});
	control.command('arm', { table: 'personnel_trainings', mode: 'hold' });
	let settled = false;
	const response = control.fetch(target).then((result) => {
		settled = true;
		return result;
	});
	assert.equal(dispatched, true);
	assert.equal(control.command('state').control.phase, 'dispatching');
	provider.resolve(originalResponse);
	await turn();
	assert.equal(control.command('state').control.phase, 'held');
	assert.equal(settled, false);
	assert.equal(control.command('state').control.call.status, 206);
	control.command('release');
	assert.equal(await response, originalResponse);
	assert.equal(await originalResponse.text(), 'source value');
	control.command('restore');
});

test('Organization setting control leaves profile, membership, full policies, B and writes untouched', async () => {
	const dispatched = [];
	const control = controller(async (...args) => {
		dispatched.push(args);
		return new Response('ordinary Organization read');
	});
	control.command('arm', { table: 'organizations', mode: 'fail' });
	const setting = `${providerUrl}/rest/v1/organizations?id=eq.${orgA}&select=loss_warning_window_days`;
	const ordinary = [
		[setting.replace('select=loss_warning_window_days', 'select=id,name,url_slug')],
		[setting.replace('select=loss_warning_window_days', 'select=*')],
		[setting.replace('select=loss_warning_window_days', 'select=archive_retention_months,loss_warning_window_days')],
		[setting.replace('select=loss_warning_window_days', 'select=personnel_document_storage_cap_bytes')],
		[setting.replace('/organizations?', '/organization_memberships?')],
		[setting.replace(orgA, orgB)],
		[setting.replace('id=eq.', 'organization_id=eq.')],
		[setting.replace(`id=eq.${orgA}`, `id=in.(${orgA},${orgB})`)],
		[`${setting}&id=eq.${orgB}`],
		[`${setting}&select=loss_warning_window_days`],
		[setting.replace('&select=loss_warning_window_days', '')],
		[setting, { method: 'PATCH' }],
		[setting, { method: 'POST' }],
		[setting, { method: 'DELETE' }],
		[setting, { method: 'HEAD' }]
	];
	for (const input of ordinary) {
		assert.equal(await (await control.fetch(...input)).text(), 'ordinary Organization read');
		assert.deepEqual(dispatched.at(-1), [input[0], input[1]]);
	}
	assert.equal(control.command('state').control.matches, 0);
	const failure = await control.fetch(setting);
	assert.equal(failure.status, 503);
	assert.equal((await failure.json()).code, 'T2T_VERIFY_SOURCE_FAILURE');
	assert.equal(dispatched.length, ordinary.length);
	control.command('restore');
});

test('Organization setting control holds only the real narrow A setting response until release', async () => {
	const source = deferred();
	let dispatched = false;
	const control = controller(() => {
		dispatched = true;
		return source.promise;
	});
	control.command('arm', { table: 'organizations', mode: 'hold' });
	let settled = false;
	const response = control
		.fetch(`${providerUrl}/rest/v1/organizations?select=loss_warning_window_days&id=eq.${orgA}`)
		.then((result) => {
			settled = true;
			return result;
		});
	assert.equal(dispatched, true);
	assert.equal(control.command('state').control.phase, 'dispatching');
	const saved = new Response('{"loss_warning_window_days":90}', { headers: { 'Content-Type': 'application/json' } });
	source.resolve(saved);
	await turn();
	assert.equal(settled, false);
	assert.equal(control.command('state').control.phase, 'held');
	control.command('release');
	assert.equal(await response, saved);
	assert.deepEqual(await saved.json(), { loss_warning_window_days: 90 });
	control.command('restore');
});

test('hard failure returns a marked 500 once without dispatching; B, other sources and retry remain real', async () => {
	const dispatched = [];
	const control = controller(async (...args) => {
		dispatched.push(args);
		return new Response('real source result');
	});
	const setting = `${providerUrl}/rest/v1/organizations?id=eq.${orgA}&select=loss_warning_window_days`;
	control.command('arm', { table: 'organizations', mode: 'fail-hard' });
	for (const url of [setting.replace(orgA, orgB), target]) {
		assert.equal(await (await control.fetch(url)).text(), 'real source result');
	}
	const response = await control.fetch(setting);
	assert.equal(response.status, 500);
	assert.equal((await response.json()).code, 'T2T_VERIFY_SOURCE_FAILURE');
	assert.equal(dispatched.length, 2);
	assert.equal(control.command('state').control.call.synthetic, true);
	assert.equal(control.command('state').control.call.status, 500);
	assert.equal(await (await control.fetch(setting)).text(), 'real source result');
	assert.equal(dispatched.length, 3);
	control.command('restore');
});

test('restore releases a held response and cannot hold a later provider response', async () => {
	for (const alreadyReturned of [false, true]) {
		const provider = deferred();
		const control = controller(() => provider.promise);
		control.command('arm', { table: 'personnel_trainings', mode: 'hold' });
		const response = control.fetch(target);
		if (alreadyReturned) {
			provider.resolve(new Response('saved'));
			await turn();
		}
		assert.equal(control.command('restore').armed, false);
		if (!alreadyReturned) provider.resolve(new Response('saved'));
		assert.equal(await (await response).text(), 'saved');
		assert.equal(control.command('state').lastControl.phase, 'restored');
	}
});

test('a bounded deadline releases only the selected ordinal and disables later interception', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const control = controller();
	control.command('arm', { table: 'personnel_trainings', mode: 'hold', ordinal: 2, holdMs: 100 });
	assert.equal(await (await control.fetch(target)).text(), 'saved source facts');
	const response = control.fetch(target);
	await turn();
	assert.equal(control.command('state').control.phase, 'held');
	t.mock.timers.tick(100);
	assert.equal(await (await response).text(), 'saved source facts');
	assert.equal(control.command('state').control.phase, 'deadline');
	assert.equal(await (await control.fetch(target)).text(), 'saved source facts');
	control.command('restore');
});

test('an interrupted held request rejects and restore remains available', async () => {
	const control = controller();
	const abort = new AbortController();
	control.command('arm', { table: 'personnel_trainings', mode: 'hold' });
	const response = control.fetch(target, { signal: abort.signal });
	await turn();
	abort.abort();
	await assert.rejects(response, { name: 'AbortError' });
	assert.equal(control.command('state').control.phase, 'interrupted');
	assert.equal(control.command('restore').armed, false);
});

test('preserves actual provider rejection without replacing it with a synthetic result', async () => {
	const error = new TypeError('Connection closed');
	const control = controller(async () => {
		throw error;
	});
	control.command('arm', { table: 'personnel_trainings', mode: 'hold' });
	await assert.rejects(control.fetch(target), (cause) => cause === error);
	assert.equal(control.command('state').control.phase, 'provider-rejection');
	control.command('restore');
});

test('the Node preloader refuses a configuration that other users can read', async () => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-source-control-rejected-'));
	await fs.chmod(session, 0o700);
	try {
		const configFile = path.join(session, 'control.json');
		await fs.writeFile(configFile, '{}', { mode: 0o644 });
		await fs.chmod(configFile, 0o644);
		const preload = new URL('./server-source-control.mjs', import.meta.url);
		preload.searchParams.set('config', configFile);
		const child = spawn(process.execPath, ['--import', preload.href, '-e', "process.stdout.write('started')"], {
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let output = '';
		child.stdout.on('data', (chunk) => (output += chunk));
		child.stderr.resume();
		const [code] = await once(child, 'exit');
		assert.notEqual(code, 0);
		assert.equal(output, '');
		await assert.rejects(fs.stat(path.join(session, 'server-source-control-ready.json')), { code: 'ENOENT' });
	} finally {
		await fs.rm(session, { recursive: true, force: true });
	}
});

test('the actual Node preloader authenticates its control endpoint and restores waits on SIGTERM', async (t) => {
	const session = await fs.mkdtemp(path.join(os.tmpdir(), 't2t-source-control-test-'));
	await fs.chmod(session, 0o700);
	const requests = [];
	const provider = createServer((request, response) => {
		requests.push(request.url);
		response.end('actual fixture source');
	});
	await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
	const config = {
		sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		token: 'd'.repeat(64),
		providerUrl: `http://127.0.0.1:${provider.address().port}`,
		orgId: orgA
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
			for await (const url of lines) {
				const response = await fetch(url);
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
	assert.equal(ready.sessionId, config.sessionId);
	const endpoint = `http://127.0.0.1:${ready.port}`;
	assert.equal((await fetch(endpoint, { method: 'POST', body: '{}' })).status, 403);
	assert.equal(
		(await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, Origin: 'foreign' } }))
			.status,
		403
	);
	async function command(action) {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { Authorization: `Bearer ${config.token}` },
			body: JSON.stringify({ action, table: 'personnel_trainings', mode: 'hold' })
		});
		assert.equal(response.headers.get('X-T2T-Session'), config.sessionId);
		return response.json();
	}
	assert.equal((await command('arm')).armed, true);
	child.stdin.write(`${config.providerUrl}/rest/v1/personnel_trainings?organization_id=eq.${orgA}\n`);
	await waitFor(() => requests.length === 1);
	let sourceState;
	for (let attempt = 0; attempt < 100; attempt++) {
		sourceState = await command('state');
		if (sourceState.control.phase === 'held') break;
	}
	assert.equal(sourceState.control.phase, 'held');
	assert.equal(output.includes('actual fixture source'), false);
	const exited = once(child, 'exit');
	child.stdin.end();
	child.kill('SIGTERM');
	await exited;
	assert.equal(output.includes('actual fixture source'), true);
	assert.equal(diagnostic, '');
	assert.equal(JSON.stringify(ready).includes(config.token), false);
});

test('personal preference/progress failures target only an A read and leave saving and B reads dispatchable', async () => {
	for (const table of ['user_org_preferences', 'getting_started_progress']) {
		const dispatched = [];
		const control = controller(async (...args) => {
			dispatched.push(args);
			return new Response('stored personal choice');
		});
		const own = `${providerUrl}/rest/v1/${table}?organization_id=eq.${orgA}&user_id=eq.synthetic-user`;
		control.command('arm', { table, mode: 'fail-hard' });
		assert.equal(await (await control.fetch(own.replace(orgA, orgB))).text(), 'stored personal choice');
		assert.equal(await (await control.fetch(own, { method: 'PATCH' })).text(), 'stored personal choice');
		assert.equal((await control.fetch(own)).status, 500);
		assert.equal(dispatched.length, 2);
		assert.equal(await (await control.fetch(own)).text(), 'stored personal choice');
		control.command('restore');
	}
});

test('Critical Task catalog failure targets only the A catalog read; completions, B and writes stay real', async () => {
	const dispatched = [];
	const control = controller(async (...args) => {
		dispatched.push(args);
		return new Response('stored task catalog');
	});
	const catalog = `${providerUrl}/rest/v1/ict_tasks?select=id,task_code,title&organization_id=eq.${orgA}&order=sort_order.asc`;
	control.command('arm', { table: 'ict_tasks', mode: 'fail-hard' });
	for (const input of [
		[catalog.replace(orgA, orgB)],
		[catalog.replace('/ict_tasks?', '/personnel_ict_completions?')],
		[catalog, { method: 'PATCH' }]
	])
		assert.equal(await (await control.fetch(...input)).text(), 'stored task catalog');
	const failure = await control.fetch(catalog);
	assert.equal(failure.status, 500);
	assert.equal((await failure.json()).code, 'T2T_VERIFY_SOURCE_FAILURE');
	assert.equal(dispatched.length, 3);
	assert.equal(await (await control.fetch(catalog)).text(), 'stored task catalog');
	control.command('restore');
});

test('Calendar type catalog hold receipts only the exact A read; the header command, B, daily rows and writes stay real', async () => {
	const dispatched = [];
	const provider = deferred();
	const catalogResponse = new Response('saved type catalog', { status: 200 });
	const catalog = `${providerUrl}/rest/v1/assignment_types?select=id,name,show_in_date_header&organization_id=eq.${orgA}&order=sort_order.asc&order=id.asc`;
	const control = controller(async (input, init) => {
		dispatched.push([String(input), init?.method ?? 'GET']);
		return String(input) === catalog && !init?.method ? provider.promise : new Response('real');
	});
	control.command('arm', { table: 'assignment_types', mode: 'hold' });
	for (const input of [
		[`${providerUrl}/rest/v1/rpc/set_assignment_type_date_header`, { method: 'POST' }],
		[catalog.replace(orgA, orgB)],
		[catalog.replace('/assignment_types?', '/daily_assignments?')],
		[catalog, { method: 'PATCH' }]
	])
		assert.equal(await (await control.fetch(...input)).text(), 'real');
	assert.equal(control.command('state').control.matches, 0);
	let settled = false;
	const held = control.fetch(catalog).then((response) => {
		settled = true;
		return response;
	});
	assert.equal(control.command('state').control.phase, 'dispatching');
	provider.resolve(catalogResponse);
	await turn();
	assert.deepEqual(control.command('state').control, {
		table: 'assignment_types',
		orgId: orgA,
		mode: 'hold',
		ordinal: 1,
		holdMs: 30000,
		phase: 'held',
		matches: 1,
		call: { method: 'GET', table: 'assignment_types', orgId: orgA, status: 200, synthetic: false }
	});
	assert.equal(settled, false);
	assert.equal(dispatched.length, 5);
	control.command('release');
	assert.equal(await held, catalogResponse);
	assert.equal(await catalogResponse.text(), 'saved type catalog');
	control.command('restore');
});
