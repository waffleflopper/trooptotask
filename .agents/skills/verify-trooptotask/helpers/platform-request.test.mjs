import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPlatform } from './platform-request.mjs';

const origin = 'http://127.0.0.1:41991';
const id = '11111111-1111-4111-8111-111111111111';
test('ordinary denial retains its full action envelope without applying it to UI', async () => {
	const target = {
		location: { origin },
		fetch: async (path, init) => {
			assert.equal(path, '/admin?/reject');
			assert.equal(init.redirect, 'manual');
			assert.equal(init.headers.Accept, 'application/json');
			assert.equal(new URLSearchParams(init.body).get('id'), id);
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
		{ family: 'invalidSuspension', body: { case: 'arbitrary' } },
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

test('malformed suspension cases send only the documented invalid payload for the recorded target', async () => {
	const expected = [
		null,
		{ type: 'user', action: 'suspend', targetId: id, reason: 42 },
		{ type: 'user', action: 'suspend', targetId: [id] }
	];
	for (const [index, name] of ['null-body', 'non-string-reason', 'array-target'].entries()) {
		let sends = 0;
		const result = await requestPlatform(
			{
				location: { origin },
				fetch: async (path, init) => {
					sends++;
					assert.equal(path, '/admin/api/suspend');
					assert.deepEqual(JSON.parse(init.body), expected[index]);
					return Response.json({ message: 'Invalid suspension command' }, { status: 400 });
				}
			},
			{ origin, family: 'invalidSuspension', targetId: id, body: { case: name } }
		);
		assert.equal(sends, 1);
		assert.equal(result.status, 400);
		assert.deepEqual(result.request.submitted, expected[index]);
	}
});

test('content requests bind the known row and preserve denied envelopes without UI application', async () => {
	for (const [family, path, body, expected] of [
		[
			'announcementCreate',
			'/admin/announcements?/create',
			{ title: 'Denied', message: 'Must not save', type: 'info' },
			{ title: 'Denied', message: 'Must not save', type: 'info' }
		],
		['announcementToggle', '/admin/announcements?/toggle', { isActive: 'false' }, { id, isActive: 'false' }],
		['announcementDelete', '/admin/announcements?/delete', {}, { id }],
		['feedbackClose', '/admin?/close', {}, { id }]
	]) {
		let sends = 0;
		const result = await requestPlatform(
			{
				location: { origin },
				fetch: async (url, init) => {
					sends++;
					assert.equal(url, path);
					assert.equal(init.method, 'POST');
					assert.equal(init.redirect, 'manual');
					assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), expected);
					return new Response('{"type":"error","status":403}', { status: 403 });
				}
			},
			{ origin, family, targetId: id, body }
		);
		assert.equal(sends, 1);
		assert.equal(result.status, 403);
		assert.equal(result.body, '{"type":"error","status":403}');
	}
});

test('content target identifiers cannot be overridden or changed into arbitrary commands', async () => {
	let sends = 0;
	const target = {
		location: { origin },
		fetch: async () => {
			sends++;
			return new Response('');
		}
	};
	for (const [family, body] of [
		['announcementCreate', { created_by: id }],
		['announcementToggle', { id }],
		['announcementDelete', { id }],
		['feedbackClose', { id }],
		['reject', { reason: ['not a string'] }]
	])
		await assert.rejects(requestPlatform(target, { origin, family, targetId: id, body }));
	assert.equal(sends, 0);
});
