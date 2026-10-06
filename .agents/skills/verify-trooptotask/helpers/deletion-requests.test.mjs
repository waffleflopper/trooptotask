import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestPersonnelArchiveBatch } from './deletion-requests.mjs';

const origin = 'http://127.0.0.1:34001';
const orgId = '00000000-0000-4000-8000-000000000001';
const ids = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];

test('Personnel batch sends the selected IDs once and preserves a partial response', async () => {
	const calls = [];
	const body = JSON.stringify({
		archivedIds: [],
		approvalRequestedIds: [ids[0]],
		errors: [{ id: ids[1], message: 'Denied' }]
	});
	const page = {
		location: { origin },
		fetch: async (...call) => {
			calls.push(call);
			return new Response(body);
		}
	};
	const result = await requestPersonnelArchiveBatch(page, { origin, orgId, ids });
	assert.equal(calls.length, 1);
	const [path, init] = calls[0];
	assert.equal(path, `/org/${orgId}/api/personnel/archive-batch`);
	assert.equal(init.method, 'POST');
	assert.equal(init.redirect, 'manual');
	assert.deepEqual(JSON.parse(init.body), { ids });
	assert.deepEqual(result, { request: { method: 'POST', path, submitted: { ids } }, status: 200, body });
});

test('Personnel batch rejects foreign pages and invalid selections before dispatch', async () => {
	let dispatched = 0;
	const page = {
		location: { origin },
		fetch: () => {
			dispatched++;
		}
	};
	for (const input of [
		{ origin: 'http://example.test', orgId, ids },
		{ origin, orgId: 'foreign', ids },
		{ origin, orgId, ids: [] },
		{ origin, orgId, ids: [ids[0], 'malformed'] },
		{ origin, orgId, ids: [null] }
	])
		await assert.rejects(requestPersonnelArchiveBatch(page, input));
	assert.equal(dispatched, 0);
});

test('Personnel batch preserves HTTP failure and redirect responses without following or retrying', async () => {
	for (const status of [503, 303]) {
		let dispatched = 0;
		const page = {
			location: { origin },
			fetch: async () => {
				dispatched++;
				return new Response('unconfirmed', { status });
			}
		};
		const result = await requestPersonnelArchiveBatch(page, { origin, orgId, ids });
		assert.equal(result.status, status);
		assert.equal(result.body, 'unconfirmed');
		assert.equal(dispatched, 1);
	}
});

test('Personnel batch exposes an unconfirmed transport failure without retrying', async () => {
	let dispatched = 0;
	const failure = new TypeError('Disconnected');
	const page = {
		location: { origin },
		fetch: async () => {
			dispatched++;
			throw failure;
		}
	};
	await assert.rejects(requestPersonnelArchiveBatch(page, { origin, orgId, ids }), (error) => error === failure);
	assert.equal(dispatched, 1);
});
