import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestOnboarding, readOnboardingRequests } from './onboarding-request.mjs';

const input = {
	origin: 'http://127.0.0.1:1234',
	organizationSegment: 'synthetic-a',
	method: 'DELETE',
	family: 'onboarding-steps',
	body: { id: 'synthetic-step' }
};

test('ordinary Start submits only its recorded inputs and preserves a blocked retry response', async () => {
	let sent;
	const page = {
		location: { origin: input.origin },
		fetch: async (...args) => {
			sent = args;
			return new Response('active packet conflict', { status: 409, headers: { 'Set-Cookie': 'private' } });
		}
	};
	const body = { personnelId: 'fresh-person', templateId: null, startedAt: '2026-10-02' };
	const result = await requestOnboarding(page, { ...input, family: 'onboarding', method: 'POST', body });
	assert.equal(sent[0], '/org/synthetic-a/api/onboarding');
	assert.equal(sent[1].method, 'POST');
	assert.equal(sent[1].redirect, 'manual');
	assert.deepEqual(JSON.parse(sent[1].body), body);
	assert.equal(result.status, 409);
	assert.equal(result.body, 'active packet conflict');
	assert.equal(Object.hasOwn(result, 'headers'), false);
	await assert.rejects(
		requestOnboarding(page, { ...input, family: 'onboarding', method: 'POST', body: { ...body, status: 'completed' } })
	);
});

test('ordinary Reopen preserves rejection and exact retry while blocking unrelated fields', async () => {
	const body = { id: 'cancelled-packet', status: 'in_progress' };
	const options = { ...input, family: 'onboarding', method: 'PUT', body };
	const sent = [];
	const responses = [
		new Response('Internal server error', {
			status: 500,
			headers: { 'Content-Type': 'text/plain', 'Set-Cookie': 'private' }
		}),
		Response.json({ id: 'cancelled-packet', status: 'in_progress', cancelledAt: null, completedAt: null })
	];
	const page = {
		location: { origin: input.origin },
		fetch: async (...args) => {
			sent.push(args);
			return responses.shift();
		}
	};
	for (const forbidden of [
		{ ...body, personnelId: 'new-person' },
		{ ...body, cancelledAt: '2026-10-02T12:00:00Z' },
		{ ...body, status: { nested: 'in_progress' } }
	])
		await assert.rejects(requestOnboarding(page, { ...options, body: forbidden }));
	assert.equal(sent.length, 0);

	assert.deepEqual(await requestOnboarding(page, options), {
		request: { method: 'PUT', path: '/org/synthetic-a/api/onboarding', submitted: body },
		status: 500,
		body: 'Internal server error',
		contentType: 'text/plain'
	});
	assert.equal(sent.length, 1, 'A rejection must not trigger an automatic retry');
	const retry = await requestOnboarding(page, options);
	assert.equal(retry.status, 200);
	assert.deepEqual(JSON.parse(retry.body), {
		id: 'cancelled-packet',
		status: 'in_progress',
		cancelledAt: null,
		completedAt: null
	});
	assert.equal(Object.hasOwn(retry, 'headers'), false);
	assert.equal(sent.length, 2);
	for (const [url, init] of sent) {
		assert.equal(url, '/org/synthetic-a/api/onboarding');
		assert.equal(init.method, 'PUT');
		assert.equal(init.redirect, 'manual');
		assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
		assert.deepEqual(JSON.parse(init.body), { id: 'cancelled-packet', status: 'in_progress' });
	}
});

test('ordinary removal records exact submitted values and real failure without credential headers', async () => {
	let sent;
	const page = {
		location: { origin: input.origin },
		fetch: async (...args) => {
			sent = args;
			return new Response('provider failure', {
				status: 500,
				headers: { 'Set-Cookie': 'private', 'Content-Type': 'text/plain' }
			});
		}
	};
	const result = await requestOnboarding(page, input);
	assert.equal(sent[0], '/org/synthetic-a/api/onboarding-steps');
	assert.equal(sent[1].method, 'DELETE');
	assert.equal(sent[1].redirect, 'manual');
	assert.deepEqual(JSON.parse(sent[1].body), input.body);
	assert.deepEqual(result, {
		request: { method: 'DELETE', path: sent[0], submitted: input.body },
		status: 500,
		body: 'provider failure',
		contentType: 'text/plain'
	});
});

test('unsupported origin, path, method or payload sends no request', async () => {
	let calls = 0;
	const page = { location: { origin: input.origin }, fetch: async () => calls++ };
	for (const options of [
		{ origin: 'http://127.0.0.1:9999' },
		{ organizationSegment: '../foreign' },
		{ family: 'onboarding' },
		{ method: 'GET' },
		{ mode: 'unknown' },
		{ body: { password: 'private' } },
		{ body: { id: { nested: 'step' } } },
		{ body: [] }
	])
		await assert.rejects(requestOnboarding(page, { ...input, ...options }));
	assert.equal(calls, 0);
});

test('two queued operations retain independent real outcomes and cannot be cleared while pending', async () => {
	const responses = [];
	const page = { location: { origin: input.origin }, fetch: () => new Promise((resolve) => responses.push(resolve)) };
	const first = await requestOnboarding(page, {
		...input,
		method: 'POST',
		family: 'onboarding-resync',
		body: { onboardingId: 'packet', newTemplateId: 'template' },
		mode: 'start'
	});
	const second = await requestOnboarding(page, { ...input, mode: 'start' });
	assert.notEqual(first.started, second.started);
	assert.deepEqual(
		readOnboardingRequests(page, input.origin).requests.map((r) => r.state),
		['pending', 'pending']
	);
	assert.throws(() => readOnboardingRequests(page, input.origin, true), /pending/);
	responses[1](new Response('delete rejected', { status: 400 }));
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(readOnboardingRequests(page, input.origin).requests[1].response.status, 400);
	assert.equal(readOnboardingRequests(page, input.origin).requests[0].state, 'pending');
	responses[0](Response.json({ steps: [{ id: 'retained', active: true }] }));
	await new Promise((resolve) => setImmediate(resolve));
	const records = readOnboardingRequests(page, input.origin).requests;
	assert.equal(records[0].response.status, 200);
	assert.deepEqual(JSON.parse(records[0].response.body), { steps: [{ id: 'retained', active: true }] });
	assert.deepEqual(records[1].response.request.submitted, input.body);
	assert.deepEqual(readOnboardingRequests(page, input.origin, true), { restored: true });
	assert.deepEqual(readOnboardingRequests(page, input.origin), { requests: [] });
});

test('transport and unreadable response failures remain unavailable and capture capacity stays bounded', async () => {
	let calls = 0;
	const page = {
		location: { origin: input.origin },
		fetch: async () => {
			calls++;
			if (calls === 2)
				return {
					status: 200,
					text: async () => {
						throw new Error('private response detail');
					}
				};
			throw new Error('private transport detail');
		}
	};
	for (let index = 0; index < 4; index++) await requestOnboarding(page, { ...input, mode: 'start' });
	await new Promise((resolve) => setImmediate(resolve));
	const records = readOnboardingRequests(page, input.origin).requests;
	assert.ok(
		records.every(
			(r) =>
				r.state === 'failed' && r.response === null && r.error === 'Request transport or response body capture failed'
		)
	);
	await assert.rejects(requestOnboarding(page, { ...input, mode: 'start' }), /restore/);
	assert.equal(calls, 4);
});
