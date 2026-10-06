import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestAuditTrainingUpdate } from './audit-request.mjs';

const input = {
	origin: 'http://127.0.0.1:1234',
	orgId: '11111111-1111-4111-8111-111111111111',
	body: { id: '22222222-2222-4222-8222-222222222222', notes: null }
};

test('Training PUT retains saved identity and real denial without response credentials', async () => {
	const page = {
		location: { origin: input.origin },
		fetch: async (path, options) => {
			assert.equal(path, `/org/${input.orgId}/api/personnel-trainings`);
			assert.equal(options.method, 'PUT');
			assert.equal(options.redirect, 'manual');
			assert.deepEqual(JSON.parse(options.body), input.body);
			return new Response('denied', { status: 403, headers: { 'Set-Cookie': 'private' } });
		}
	};
	assert.deepEqual(await requestAuditTrainingUpdate(page, input), {
		request: { method: 'PUT', path: `/org/${input.orgId}/api/personnel-trainings`, submitted: input.body },
		status: 403,
		body: 'denied'
	});
});

test('unowned targets and unsupported payloads make no request', async () => {
	let calls = 0;
	const page = { location: { origin: input.origin }, fetch: async () => calls++ };
	for (const change of [
		{ origin: 'http://127.0.0.1:9999' },
		{ orgId: '../foreign' },
		{ orgId: '-'.repeat(36) },
		{ body: [] },
		{ body: { ...input.body, password: 'private' } },
		{ body: { ...input.body, notes: { nested: true } } },
		{ body: { notes: 'missing identity' } }
	]) {
		await assert.rejects(requestAuditTrainingUpdate(page, { ...input, ...change }));
	}
	assert.equal(calls, 0);
});
