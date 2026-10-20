import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestSettings } from './settings-request.mjs';

const input = {
	origin: 'http://127.0.0.1:1234',
	organizationSegment: 'synthetic-a',
	family: 'organization/settings',
	body: { personnelDocumentStorageCapMb: 11 }
};

test('policy requests preserve the submitted values and real response without exposing headers', async () => {
	let sent;
	const page = {
		location: { origin: input.origin },
		fetch: async (...args) => {
			sent = args;
			return new Response('denied', {
				status: 403,
				headers: { 'Set-Cookie': 'private', 'Content-Type': 'text/plain' }
			});
		}
	};
	const result = await requestSettings(page, input);
	assert.equal(sent[0], '/org/synthetic-a/api/organization/settings');
	assert.equal(sent[1].method, 'POST');
	assert.equal(sent[1].redirect, 'manual');
	assert.deepEqual(JSON.parse(sent[1].body), input.body);
	assert.deepEqual(result, {
		request: { method: 'POST', path: sent[0], submitted: input.body },
		status: 403,
		body: 'denied',
		contentType: 'text/plain'
	});
});

test('named form actions use SvelteKit enhancement semantics and retain the action failure envelope', async () => {
	const envelope = { type: 'failure', status: 403, data: '[{"deleteError":1},"denied"]' };
	const page = {
		location: { origin: input.origin },
		fetch: async (path, request) => {
			assert.equal(path, '/org/synthetic-a/settings/danger?/deleteOrganization');
			assert.equal(request.headers['x-sveltekit-action'], 'true');
			assert.equal(new URLSearchParams(request.body).get('confirmName'), 'A & B');
			return Response.json(envelope);
		}
	};
	const result = await requestSettings(page, {
		...input,
		family: 'settings/danger/deleteOrganization',
		body: { confirmName: 'A & B' }
	});
	assert.equal(result.status, 200);
	assert.deepEqual(JSON.parse(result.body), envelope);
});

test('the member invite action submits only email, role and preset to the A Members form action', async () => {
	const page = {
		location: { origin: input.origin },
		fetch: async (path, request) => {
			assert.equal(path, '/org/synthetic-a/settings/members?/invite');
			assert.deepEqual(Object.fromEntries(new URLSearchParams(request.body)), {
				email: 'denied@example.test',
				membershipRole: 'member',
				memberPreset: 'viewer'
			});
			return Response.json({ type: 'failure', status: 403, data: '[{"inviteError":1},"denied"]' });
		}
	};
	const result = await requestSettings(page, {
		...input,
		family: 'settings/members/invite',
		body: { email: 'denied@example.test', membershipRole: 'member', memberPreset: 'viewer' }
	});
	assert.equal(JSON.parse(result.body).status, 403);
	await assert.rejects(
		requestSettings(page, { ...input, family: 'settings/members/invite', body: { accessScopeGroupIds: 'x' } })
	);
});

test('an unowned origin, path traversal, unknown action or unsupported payload sends no request', async () => {
	let calls = 0;
	const page = { location: { origin: input.origin }, fetch: async () => calls++ };
	for (const options of [
		{ origin: 'http://127.0.0.1:9999' },
		{ organizationSegment: '../foreign' },
		{ family: 'settings/danger/transferOwnership' },
		{ body: { password: 'private' } },
		{ body: { archiveRetentionMonths: { nested: 12 } } },
		{ body: [] }
	]) {
		await assert.rejects(requestSettings(page, { ...input, ...options }));
	}
	assert.equal(calls, 0);
});

test('feature switches submit a list of keys and nothing else may be a list', async () => {
	let sent;
	const page = {
		location: { origin: input.origin },
		fetch: async (...args) => {
			sent = args;
			return Response.json({ success: true });
		}
	};
	const body = { disabledFeatures: ['training', 'lossesAndAwards'], strengthFloorPercent: 70 };
	const result = await requestSettings(page, { ...input, body });
	assert.equal(sent[0], '/org/synthetic-a/api/organization/settings');
	assert.deepEqual(JSON.parse(sent[1].body), body);
	assert.equal(result.status, 200);
	await assert.rejects(requestSettings(page, { ...input, body: { disabledFeatures: [7] } }));
	await assert.rejects(requestSettings(page, { ...input, body: { lossWarningWindowDays: [30] } }));
});
