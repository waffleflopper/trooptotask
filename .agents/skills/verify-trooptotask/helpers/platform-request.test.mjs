import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPlatform } from './platform-request.mjs';

const origin = 'http://127.0.0.1:41991';
const id = '11111111-1111-4111-8111-111111111111';
test('ordinary denial retains its full action envelope without applying it to UI', async () => {
	const target = {
		location: { origin },
		fetch: async (path, init) => {
			assert.equal(path, '/admin/access-requests?/reject');
			assert.equal(init.redirect, 'manual');
			assert.equal(init.headers.Accept, 'application/json');
			assert.equal(new URLSearchParams(init.body).get('requestId'), id);
			return new Response('{"type":"failure","status":403,"data":"denied"}', { status: 403 });
		}
	};
	const result = await requestPlatform(target, { origin, family: 'reject', targetId: id, body: {} });
	assert.equal(result.status, 403);
	assert.equal(result.body, '{"type":"failure","status":403,"data":"denied"}');
});
test('foreign origin, unsupported endpoints/fields and non-UUID targets never dispatch', async () => {
	let sends = 0;
	const target = {
		location: { origin },
		fetch: async () => {
			sends++;
			return new Response('');
		}
	};
	for (const patch of [
		{ origin: 'https://example.test' },
		{ family: 'deleteUser' },
		{ targetId: '../users' },
		{ body: { role: 'super_admin' } },
		{ body: { reason: { secret: true } } }
	])
		await assert.rejects(
			requestPlatform(target, {
				origin,
				family: 'suspend',
				targetId: id,
				body: { type: 'user', action: 'suspend' },
				...patch
			})
		);
	assert.equal(sends, 0);
});
