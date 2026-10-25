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

test('content transport rejection consumes only its selected action and permits an explicit retry', async () => {
	let dispatched = 0;
	const page = {
		location: { href: 'http://owned.test/admin/feedback' },
		fetch: async () => {
			dispatched++;
			return Response.json({ untouched: true });
		}
	};
	installNetworkControl(page, {
		...platformFormNetworkTarget('admin-feedback/update', fixture, null),
		mode: 'reject',
		ordinal: 1
	});
	await page.fetch('http://other.test/admin/feedback?/update', { method: 'POST' });
	await page.fetch('/admin/feedback?/update');
	await page.fetch('/admin/feedback?/other', { method: 'POST' });
	assert.equal(dispatched, 3);
	await assert.rejects(page.fetch('/admin/feedback?/update', { method: 'POST' }), TypeError);
	assert.equal(dispatched, 3);
	assert.equal((await page.fetch('/admin/feedback?/update', { method: 'POST' })).status, 200);
	assert.equal(dispatched, 4);
});

for (const [family, route, action] of [
	['admin-announcements/create', '/admin/announcements', 'create'],
	['admin-announcements/toggle', '/admin/announcements', 'toggle'],
	['admin-announcements/delete', '/admin/announcements', 'delete'],
	['admin-feedback/update', '/admin/feedback', 'update']
]) {
	test(`${family} fails only the selected same-origin form action and permits retry`, async () => {
		const dispatched = [];
		const page = {
			location: { href: `http://owned.test${route}` },
			fetch: async (url) => {
				dispatched.push(url);
				return Response.json({ untouched: true });
			}
		};
		installNetworkControl(page, {
			...platformFormNetworkTarget(family, fixture, null),
			mode: 'fail',
			ordinal: 1
		});
		await page.fetch(`http://other.test${route}?/${action}`, { method: 'POST' });
		await page.fetch(`${route}?/${action}`);
		await page.fetch(`${route}?/other`, { method: 'POST' });
		assert.equal(dispatched.length, 3);
		const response = await page.fetch(`${route}?/${action}`, { method: 'POST' });
		assert.equal(response.status, 503);
		const envelope = await response.json();
		assert.deepEqual(parse(envelope.data), { error: 'Synthetic request failure' });
		assert.equal(dispatched.length, 3);
		const retry = await page.fetch(`${route}?/${action}`, { method: 'POST' });
		assert.equal(retry.status, 200);
		assert.equal(dispatched.length, 4);
	});
}

for (const [family, route] of [
	['admin-dashboard-read', '/admin/__data.json'],
	['admin-users-read', '/admin/users/__data.json'],
	['admin-organizations-read', '/admin/organizations/__data.json'],
	['admin-feedback-read', '/admin/feedback/__data.json'],
	['admin-announcements-read', '/admin/announcements/__data.json']
]) {
	test(`${family} leaves foreign origins, other admin pages and form writes untouched`, async () => {
		let dispatched = 0;
		const page = {
			location: { href: 'http://owned.test/admin' },
			fetch: async () => {
				dispatched++;
				return Response.json({ untouched: true });
			}
		};
		installNetworkControl(page, {
			...platformFormNetworkTarget(family, fixture, null),
			mode: 'fail',
			ordinal: 1
		});
		await page.fetch(`http://other.test${route}`);
		await page.fetch('/admin/feedback?/update', { method: 'POST' });
		await page.fetch('/admin/access-requests/__data.json');
		assert.equal(dispatched, 3);
		assert.equal(page.__mapNetwork.calls.length, 0);
		assert.equal((await page.fetch(`${route}?page=2`)).status, 503);
		assert.equal(dispatched, 3);
	});
}

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

test('account control resolves the seeded pending account by its recorded ID', () => {
	const pending = '30000000-0000-4000-8000-000000000001';
	assert.deepEqual(
		platformFormNetworkTarget('admin-account/pendingUser/resendInvite', fixture, {
			...seed,
			pendingUser: { id: pending }
		}),
		{
			suffix: `/admin/users/${pending}`,
			search: '?/resendInvite',
			failureField: 'error',
			sameOrigin: true,
			requestTarget: null
		}
	);
	assert.throws(() => platformFormNetworkTarget('admin-account/pendingUser/resetPassword', fixture, seed));
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

test('review read failure is same-origin and leaves form posts and other routes untouched', async () => {
	let dispatched = 0;
	const page = {
		location: { href: 'http://owned.test/admin/access-requests' },
		fetch: async () => {
			dispatched++;
			return Response.json({ untouched: true });
		}
	};
	installNetworkControl(page, {
		...platformFormNetworkTarget('admin-access-read', fixture, seed),
		mode: 'fail',
		ordinal: 1
	});
	await page.fetch('http://other.test/admin/access-requests/__data.json');
	await page.fetch('/admin/access-requests?/approve', { method: 'POST' });
	await page.fetch('/admin/users/__data.json');
	assert.equal(dispatched, 3);
	assert.equal(page.__mapNetwork.calls.length, 0);
	const response = await page.fetch('/admin/access-requests/__data.json?x-sveltekit-invalidated=111');
	assert.equal(response.status, 503);
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal(dispatched, 3);
	assert.throws(() => platformFormNetworkTarget('admin-access-read', fixture, null));
});

test('detail page reads bind only the recorded User or Organization', async () => {
	const organization = '30000000-0000-4000-8000-000000000001';
	const detailSeed = { ...seed, organization: { id: organization } };
	for (const [family, route, sibling] of [
		['admin-user-detail-read', `/admin/users/${invitee}`, `/admin/users/${selected}`],
		['admin-organization-detail-read', `/admin/organizations/${organization}`, `/admin/organizations/${other}`]
	]) {
		let dispatched = 0;
		const page = {
			location: { href: `http://owned.test${route}` },
			fetch: async () => {
				dispatched++;
				return Response.json({ untouched: true });
			}
		};
		installNetworkControl(page, {
			...platformFormNetworkTarget(family, fixture, detailSeed),
			mode: 'fail',
			ordinal: 1
		});
		await page.fetch(`${sibling}/__data.json`);
		await page.fetch(`${route}?/resetPassword`, { method: 'POST' });
		await page.fetch(`http://other.test${route}/__data.json`);
		assert.equal(page.__mapNetwork.calls.length, 0);
		assert.equal((await page.fetch(`${route}/__data.json?x-sveltekit-invalidated=01`)).status, 503);
		assert.equal(dispatched, 3);
		assert.throws(() => platformFormNetworkTarget(family, fixture, null));
	}
});
