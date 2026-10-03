import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'devalue';
import { platformFormNetworkTarget } from './platform-network-target.mjs';
import { installNetworkControl } from './network-control.mjs';

const invitee = '10000000-0000-4000-8000-000000000001';
const selected = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const fixture = { actors: { orgInvitee: { id: invitee } } };
const seed = { requests: { approve: { id: selected }, reject: { id: other } } };

test('account control resolves only a named fixture and exact support action', () => {
	assert.deepEqual(platformFormNetworkTarget('admin-account/orgInvitee/resetPassword', fixture, seed), {
		suffix: `/admin/users/${invitee}`,
		search: '?/resetPassword',
		failureField: 'error',
		sameOrigin: true,
		requestTarget: null
	});
	assert.equal(platformFormNetworkTarget(`admin-account/${invitee}/resetPassword`, fixture, seed), null);
	assert.equal(platformFormNetworkTarget('admin-account/orgInvitee/suspend', fixture, seed), null);
	assert.throws(() => platformFormNetworkTarget('admin-account/orgMember/resendInvite', fixture, seed));
	assert.throws(() => platformFormNetworkTarget('admin-account/orgInvitee/resetPassword', fixture, null));
});

for (const bodyKind of ['form', 'urlencoded', 'request']) {
	test(`Access Request held failure targets only the saved request (${bodyKind})`, async () => {
		let dispatched = 0;
		const page = {
			location: { href: 'http://owned.test/admin/access-requests' },
			fetch: async () => {
				dispatched++;
				return Response.json({ untouched: true });
			}
		};
		installNetworkControl(page, {
			...platformFormNetworkTarget('admin-access/approve/approve', fixture, seed),
			mode: 'hold-fail',
			ordinal: 1
		});
		const form = (id) => {
			const value = new FormData();
			value.set('requestId', id);
			return value;
		};
		await page.fetch('http://other.test/admin/access-requests?/approve', { method: 'POST', body: form(selected) });
		await page.fetch('/admin/access-requests?/approve', { method: 'GET' });
		await page.fetch('/admin/access-requests?/reject', { method: 'POST', body: form(selected) });
		await page.fetch('/admin/access-requests?/approve', { method: 'POST', body: form(other) });
		assert.equal(dispatched, 4);
		assert.equal(page.__mapNetwork.calls.length, 0);
		const pending =
			bodyKind === 'request'
				? page.fetch(
						new Request('http://owned.test/admin/access-requests?/approve', { method: 'POST', body: form(selected) })
					)
				: page.fetch('/admin/access-requests?/approve', {
						method: 'POST',
						body: bodyKind === 'form' ? form(selected) : new URLSearchParams({ requestId: selected }).toString()
					});
		let settled = false;
		pending.then(() => {
			settled = true;
		});
		await new Promise(setImmediate);
		assert.equal(settled, false);
		assert.equal(dispatched, 4);
		assert.equal(page.__mapNetwork.calls[0].formTarget, selected);
		page.__mapNetwork.release();
		const response = await pending;
		assert.equal(response.status, 503);
		const envelope = await response.json();
		assert.equal(envelope.type, 'failure');
		assert.deepEqual(parse(envelope.data), { error: 'Synthetic request failure' });
		await page.fetch('/admin/access-requests?/approve', { method: 'POST', body: form(selected) });
		assert.equal(dispatched, 5);
	});
}

test('account failure control leaves other origins, Users, methods and actions untouched', async () => {
	let dispatched = 0;
	const page = {
		location: { href: 'http://owned.test/admin/users' },
		fetch: async () => {
			dispatched++;
			return Response.json({ untouched: true });
		}
	};
	installNetworkControl(page, {
		...platformFormNetworkTarget('admin-account/orgInvitee/resetPassword', fixture, seed),
		mode: 'fail',
		ordinal: 1
	});
	await page.fetch(`http://other.test/admin/users/${invitee}?/resetPassword`, { method: 'POST' });
	await page.fetch(`/admin/users/${other}?/resetPassword`, { method: 'POST' });
	await page.fetch(`/admin/users/${invitee}?/resendInvite`, { method: 'POST' });
	await page.fetch(`/admin/users/${invitee}?/resetPassword`);
	assert.equal(dispatched, 4);
	assert.equal(page.__mapNetwork.calls.length, 0);
	const response = await page.fetch(`/admin/users/${invitee}?/resetPassword`, { method: 'POST' });
	assert.equal(response.status, 503);
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal(dispatched, 4);
});
