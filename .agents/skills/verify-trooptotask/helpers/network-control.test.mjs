import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installNetworkControl } from './network-control.mjs';
import { parse } from 'devalue';

for (const mode of ['hold', 'hold-fail', 'fail', 'observe']) {
	test(`preference ${mode} selects only the owned PATCH and preserves unrelated traffic`, async () => {
		const dispatched = [];
		const page = {
			location: { href: 'http://localhost/org/a/training' },
			fetch: async (url, init) => {
				dispatched.push({ url, body: init?.body });
				return Response.json({ training: { selectedGroupId: 'alpha' } });
			}
		};
		const suffix = '/org/a/api/user-preferences';
		installNetworkControl(page, { mode, ordinal: 1, suffix, requestMethod: 'PATCH', sameOrigin: true });
		await page.fetch(suffix);
		await page.fetch('/org/b/api/user-preferences', { method: 'PATCH' });
		await page.fetch('http://foreign.test' + suffix, { method: 'PATCH' });
		await page.fetch(suffix, { method: 'POST' });
		assert.equal(page.__mapNetwork.calls.length, 0);
		const patch = { training: { selectedGroupId: 'alpha' }, ignoredSecret: 'private' };
		let settled = false;
		const saved = page.fetch(suffix, { method: 'PATCH', body: JSON.stringify(patch) });
		saved.then(() => (settled = true));
		await new Promise(setImmediate);
		assert.equal(dispatched.length, mode === 'hold' || mode === 'observe' ? 5 : 4);
		if (mode.startsWith('hold')) {
			assert.equal(settled, false);
			page.__mapNetwork.release();
		}
		assert.equal((await saved).status, mode === 'fail' || mode === 'hold-fail' ? 503 : 200);
		assert.deepEqual(page.__mapNetwork.calls[0].preferencePatch, { training: { selectedGroupId: 'alpha' } });
		assert.ok(!JSON.stringify(page.__mapNetwork.calls).includes('private'));
		assert.equal((await page.fetch(suffix, { method: 'PATCH' })).status, 200);
	});
}

test('optional shell failure isolates the selected GET part, origin and Organization', async () => {
	const page = {
		location: { href: 'http://localhost/org/a/training' },
		fetch: async () => Response.json({ ok: true, organizations: [{ id: 'b' }] })
	};
	const suffix = '/org/a/api/app-shell-chrome';
	installNetworkControl(page, {
		mode: 'fail',
		ordinal: 1,
		suffix,
		search: '?part=notification-count',
		requestMethod: 'GET',
		sameOrigin: true
	});
	for (const [url, init] of [
		[suffix + '?part=organization-switcher'],
		['/org/b/api/app-shell-chrome?part=notification-count'],
		['http://foreign.test' + suffix + '?part=notification-count'],
		[suffix + '?part=notification-count', { method: 'POST' }]
	])
		assert.equal((await page.fetch(url, init)).status, 200);
	assert.equal(page.__mapNetwork.calls.length, 0);
	assert.equal((await page.fetch(suffix + '?part=notification-count')).status, 503);
	assert.equal((await page.fetch(suffix + '?part=notification-count')).status, 200);
});

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test('held Personnel failure isolates one owned PUT without dispatch and permits an explicit retry', async () => {
	const dispatched = [];
	const page = {
		location: { href: 'http://localhost/org/a/personnel' },
		fetch: async (url, init) => {
			dispatched.push({ url, method: init?.method });
			return Response.json({ id: 'person-a', clinicRole: 'Saved' });
		}
	};
	const suffix = '/org/a/api/personnel';
	installNetworkControl(page, { mode: 'hold-fail', ordinal: 1, suffix, requestMethod: 'PUT', sameOrigin: true });
	for (const [url, method] of [
		[suffix, 'GET'],
		[suffix, 'POST'],
		[suffix, 'DELETE'],
		['/org/b/api/personnel', 'PUT'],
		['http://foreign.test' + suffix, 'PUT'],
		[suffix + '/batch', 'PUT']
	])
		assert.equal((await page.fetch(url, { method })).status, 200);
	assert.equal(page.__mapNetwork.calls.length, 0);
	assert.equal(dispatched.length, 6);
	let settled = false;
	const pending = page.fetch(suffix, { method: 'PUT', body: JSON.stringify({ id: 'person-a', clinicRole: 'Held' }) });
	pending.then(() => (settled = true));
	await new Promise(setImmediate);
	assert.equal(settled, false);
	assert.equal(dispatched.length, 6);
	page.__mapNetwork.release();
	const response = await pending;
	assert.equal(response.status, 503);
	assert.deepEqual(await response.json(), { message: 'Synthetic request failure' });
	assert.deepEqual(
		page.__mapNetwork.calls.map(({ method, status }) => ({ method, status })),
		[{ method: 'PUT', status: 503 }]
	);
	assert.equal(dispatched.length, 6);
	assert.equal((await page.fetch(suffix, { method: 'PUT' })).status, 200);
	assert.equal(dispatched.length, 7);
});

for (const family of ['deletion-requests/review', 'personnel/archive-batch']) {
	for (const mode of ['fail', 'hold', 'hold-fail', 'reject', 'observe']) {
		test(`${family} ${mode} preserves the selected POST after non-POST requests`, async () => {
			let ordinaryCalls = 0;
			const page = {
				fetch: async () => {
					ordinaryCalls++;
					return new Response('ordinary');
				}
			};
			const suffix = `/org/a/api/${family}`;
			installNetworkControl(page, { mode, ordinal: 1, suffix });
			const nonPosts = [
				page.fetch(suffix, { method: 'GET' }),
				page.fetch(suffix, { method: 'HEAD' }),
				page.fetch(new Request('http://localhost' + suffix, { method: 'POST' }), { method: 'GET' })
			];
			await new Promise(setImmediate);
			assert.equal(page.__mapNetwork.calls.length, 0);
			for (const response of await Promise.all(nonPosts)) assert.equal(await response.text(), 'ordinary');
			assert.equal(ordinaryCalls, 3);

			const review = page.fetch(suffix, { method: 'post' });
			if (mode === 'reject') {
				await assert.rejects(review, TypeError);
			} else {
				let settled = false;
				review.then(() => (settled = true));
				await new Promise(setImmediate);
				if (mode === 'hold' || mode === 'hold-fail') {
					assert.equal(settled, false);
					page.__mapNetwork.release();
				}
				assert.equal((await review).status, mode === 'fail' || mode === 'hold-fail' ? 503 : 200);
			}
			assert.equal(page.__mapNetwork.calls.length, 1);
			assert.equal(page.__mapNetwork.calls[0].method, 'POST');
			assert.equal((await page.fetch(suffix, { method: 'POST' })).status, 200);
			assert.equal(ordinaryCalls, mode === 'hold' || mode === 'observe' ? 5 : 4);
		});
	}
}

test('bulk observation preserves one request and its exact selected IDs', async () => {
	const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
	let received;
	const page = {
		fetch: async (_url, init) => {
			received = JSON.parse(init.body);
			return Response.json({ archivedIds: ids });
		}
	};
	installNetworkControl(page, { mode: 'observe', ordinal: 1, suffix: '/org/a/api/personnel/archive-batch' });
	const response = await page.fetch('/org/a/api/personnel/archive-batch', {
		method: 'POST',
		body: JSON.stringify({ ids })
	});
	assert.deepEqual(await response.json(), { archivedIds: ids });
	assert.deepEqual(received, { ids });
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal(page.__mapNetwork.calls[0].count, 2);
	assert.deepEqual(page.__mapNetwork.calls[0].ids, ids);
});

test('review transport rejection affects one exact POST without dispatch or foreign interference', async () => {
	let ordinaryCalls = 0;
	const page = {
		fetch: async () => {
			ordinaryCalls++;
			return new Response('ordinary');
		}
	};
	installNetworkControl(page, { mode: 'reject', ordinal: 1, suffix: '/org/a/api/deletion-requests/review' });
	await page.fetch('/org/b/api/deletion-requests/review', { method: 'POST' });
	await page.fetch('/org/a/api/deletion-requests/review', { method: 'GET' });
	await page.fetch('/org/a/api/deletion-requests', { method: 'POST' });
	assert.equal(page.__mapNetwork.calls.length, 0);
	await assert.rejects(page.fetch('/org/a/api/deletion-requests/review', { method: 'POST' }), TypeError);
	assert.equal(ordinaryCalls, 3);
	assert.equal(page.__mapNetwork.calls[0].failure, 'transport');
	assert.equal(page.__mapNetwork.calls[0].status, null);
	assert.equal((await page.fetch('/org/a/api/deletion-requests/review', { method: 'POST' })).status, 200);
	assert.equal(ordinaryCalls, 4);
});

test('a delayed synthetic policy failure stays pending until release and never reaches the provider', async () => {
	let ordinaryCalls = 0;
	const page = {
		fetch: async () => {
			ordinaryCalls++;
			return new Response('real');
		}
	};
	installNetworkControl(page, { mode: 'hold-fail', ordinal: 1, suffix: '/org/a/api/organization/settings' });
	assert.equal((await page.fetch('/org/b/api/organization/settings', { method: 'POST' })).status, 200);
	assert.equal((await page.fetch('/org/a/api/organization/settings', { method: 'GET' })).status, 200);
	assert.equal(page.__mapNetwork.calls.length, 0);
	let settled = false;
	const pending = page.fetch('/org/a/api/organization/settings', { method: 'POST' });
	pending.then(() => {
		settled = true;
	});
	await new Promise(setImmediate);
	assert.equal(settled, false);
	assert.equal(ordinaryCalls, 2);
	page.__mapNetwork.release();
	assert.equal((await pending).status, 503);
	assert.equal(ordinaryCalls, 2);
	assert.equal((await page.fetch('/org/a/api/organization/settings', { method: 'POST' })).status, 200);
});

test('a held request is selected by arrival order when responses overlap', async () => {
	const responses = [deferred(), deferred()];
	let received = 0;
	const page = { fetch: () => responses[received++].promise };
	installNetworkControl(page, {
		mode: 'hold',
		ordinal: 2,
		suffix: '/org/a/api/calendar-range'
	});
	const control = page.__mapNetwork;
	const first = page.fetch('/org/a/api/calendar-range');
	const second = page.fetch('/org/a/api/calendar-range');
	let firstResult;
	let secondResult;
	first.then((response) => (firstResult = response));
	second.then((response) => (secondResult = response));

	responses[1].resolve({ status: 200, marker: 'second' });
	await new Promise(setImmediate);
	assert.equal(firstResult, undefined);
	assert.equal(secondResult, undefined);
	const release = control.release;
	assert.equal(typeof release, 'function');

	responses[0].resolve({ status: 200, marker: 'first' });
	await new Promise(setImmediate);
	assert.equal(firstResult.marker, 'first');
	assert.equal(secondResult, undefined);
	assert.equal(control.release, release);

	release();
	await new Promise(setImmediate);
	assert.equal(secondResult.marker, 'second');
	assert.deepEqual(
		control.calls.map((call) => call.status),
		[200, 200]
	);
});

test('a single availability control ignores batch and another organization', async () => {
	const page = { fetch: async () => new Response('real response', { status: 200 }) };
	installNetworkControl(page, {
		mode: 'fail',
		ordinal: 1,
		suffix: '/org/a/api/availability'
	});
	assert.equal((await page.fetch('/org/a/api/availability/batch')).status, 200);
	assert.equal((await page.fetch('/org/b/api/availability')).status, 200);
	assert.equal(page.__mapNetwork.calls.length, 0);
	assert.equal((await page.fetch('/org/a/api/availability?day=2026-09-27')).status, 503);
	assert.equal(page.__mapNetwork.calls.length, 1);
});

test('a form failure reaches the selected action without intercepting another action or tenant', async () => {
	const page = { fetch: async () => new Response('ordinary result', { status: 200 }) };
	installNetworkControl(page, {
		mode: 'fail',
		ordinal: 1,
		suffix: '/org/a/settings/general',
		search: '?/updateSlug',
		failureField: 'slugError'
	});
	assert.equal((await page.fetch('/org/a/settings/general?/updateName', { method: 'POST' })).status, 200);
	assert.equal((await page.fetch('/org/b/settings/general?/updateSlug', { method: 'POST' })).status, 200);
	assert.equal((await page.fetch('/org/a/settings/general', { method: 'GET' })).status, 200);
	assert.equal((await page.fetch('/org/a/settings/general?/updateSlug', { method: 'GET' })).status, 200);
	const failure = await page.fetch('/org/a/settings/general?/updateSlug', { method: 'POST' });
	assert.equal(failure.status, 503);
	const result = await failure.json();
	assert.equal(result.type, 'failure');
	assert.equal(result.status, 503);
	assert.deepEqual(parse(result.data), { slugError: 'Synthetic request failure' });
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal((await page.fetch('/org/a/settings/general?/updateSlug', { method: 'POST' })).status, 200);
});

test('a form error answers the selected action with an unexpected-error envelope', async () => {
	const page = { fetch: async () => new Response('ordinary result', { status: 200 }) };
	installNetworkControl(page, { mode: 'error', ordinal: 1, suffix: '/dashboard', search: '?/acceptInvitation' });
	assert.equal((await page.fetch('/dashboard?/declineInvitation', { method: 'POST' })).status, 200);
	const error = await page.fetch('/dashboard?/acceptInvitation', { method: 'POST' });
	assert.equal(error.status, 500);
	assert.deepEqual(await error.json(), { type: 'error', error: { message: 'Synthetic server error' } });
	assert.equal((await page.fetch('/dashboard?/acceptInvitation', { method: 'POST' })).status, 200);
});

test('form filtering uses the effective Request method, including a fetch init override', async () => {
	const page = { fetch: async () => new Response('ordinary result') };
	installNetworkControl(page, {
		mode: 'fail',
		ordinal: 1,
		suffix: '/org/a/settings/general',
		search: '?/updateName',
		failureField: 'error'
	});
	const url = 'http://localhost/org/a/settings/general?/updateName';
	assert.equal((await page.fetch(new Request(url, { method: 'POST' }), { method: 'GET' })).status, 200);
	assert.equal(page.__mapNetwork.calls.length, 0);
	assert.equal((await page.fetch(new Request(url), { method: 'post' })).status, 503);
	assert.equal(page.__mapNetwork.calls[0].method, 'POST');
});

test('observation preserves the real download and records only public response metadata', async () => {
	const response = new Response('download contents', {
		status: 200,
		headers: {
			'Content-Disposition': 'attachment; filename="training-report.xlsx"',
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Set-Cookie': 'private-session'
		}
	});
	const page = { fetch: async () => response };
	installNetworkControl(page, { mode: 'observe', ordinal: 1, suffix: '/org/a/api/training-reports/export' });
	const result = await page.fetch('/org/a/api/training-reports/export');
	assert.equal(await result.text(), 'download contents');
	assert.equal(page.__mapNetwork.calls[0].status, 200);
	assert.equal(page.__mapNetwork.calls[0].contentDisposition, 'attachment; filename="training-report.xlsx"');
	assert.equal(
		page.__mapNetwork.calls[0].contentType,
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	);
	assert.equal(page.__mapNetwork.release, null);
	assert.ok(!JSON.stringify(page.__mapNetwork.calls).includes('private-session'));
});

test('restoring a control disables a client-captured fetch wrapper', async () => {
	const page = { fetch: async () => new Response('provider result', { status: 200 }) };
	installNetworkControl(page, { mode: 'fail', ordinal: 1, suffix: '/org/a/api/onboarding-templates' });
	const captured = page.fetch;
	const control = page.__mapNetwork;
	page.fetch = control.original;
	delete page.__mapNetwork;
	const response = await captured('/org/a/api/onboarding-templates', { method: 'POST' });
	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'provider result');
	assert.equal(control.calls.length, 0);
});

test('restoring while a provider response is pending leaves no held request', async () => {
	const provider = deferred();
	const page = { fetch: () => provider.promise };
	installNetworkControl(page, { mode: 'hold', ordinal: 1, suffix: '/org/a/api/onboarding-templates' });
	const request = page.fetch('/org/a/api/onboarding-templates', { method: 'POST' });
	const control = page.__mapNetwork;
	page.fetch = control.original;
	delete page.__mapNetwork;
	provider.resolve(new Response('saved provider result', { status: 200 }));
	const response = await request;
	assert.equal(await response.text(), 'saved provider result');
	assert.equal(control.release, null);
});

test('lost response preserves real dispatch while isolating the exact platform action and requiring no automatic retry', async () => {
	let writes = 0;
	const suffix = '/admin/organizations/11111111-1111-4111-8111-111111111111';
	const page = {
		fetch: async (url, init) => {
			if (String(url) === `${suffix}?/transferOwnership` && init?.method === 'POST') writes++;
			return Response.json({ success: true }, { headers: { 'Set-Cookie': 'private-session' } });
		}
	};
	installNetworkControl(page, { mode: 'drop-response', ordinal: 1, suffix, search: '?/transferOwnership' });
	await page.fetch(`${suffix}?/makeAdmin`, { method: 'POST' });
	await page.fetch('/admin/organizations/22222222-2222-4222-8222-222222222222?/transferOwnership', { method: 'POST' });
	await page.fetch(`${suffix}?/transferOwnership`, { method: 'GET' });
	assert.equal(writes, 0);
	assert.equal(page.__mapNetwork.calls.length, 0);
	await assert.rejects(page.fetch(`${suffix}?/transferOwnership`, { method: 'POST' }), TypeError);
	assert.equal(writes, 1);
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal(page.__mapNetwork.calls[0].status, 200);
	assert.equal(page.__mapNetwork.calls[0].failure, 'response');
	assert.ok(!JSON.stringify(page.__mapNetwork.calls).includes('private-session'));
	assert.equal((await page.fetch(`${suffix}?/transferOwnership`, { method: 'POST' })).status, 200);
	assert.equal(writes, 2);
});

test('availability removal observation records the JSON IDs and preserves the real response', async () => {
	const page = { fetch: async () => Response.json({ deleted: 2 }) };
	installNetworkControl(page, { mode: 'observe', ordinal: 1, suffix: '/org/a/api/availability/batch' });
	const response = await page.fetch('/org/a/api/availability/batch', {
		method: 'DELETE',
		body: JSON.stringify({ ids: ['saved-a', 'saved-b', 'saved-a'] })
	});
	assert.deepEqual(await response.json(), { deleted: 2 });
	assert.deepEqual(
		page.__mapNetwork.calls.map(({ method, count, ids, status }) => ({ method, count, ids, status })),
		[{ method: 'DELETE', count: 3, ids: ['saved-a', 'saved-b', 'saved-a'], status: 200 }]
	);
});

test('a page server-load error dispatches the real read and fails only the page node of the selected request', async () => {
	const suffix = '/admin/users/__data.json';
	const nodes = [
		{ type: 'data', data: [{}] },
		{ type: 'data', data: [{ nav: 1 }] },
		{ type: 'data', data: [{ users: 2 }] }
	];
	let reads = 0;
	const page = {
		location: { href: 'http://localhost/admin' },
		fetch: async (url) => {
			if (new URL(String(url), 'http://localhost/').pathname === suffix) reads++;
			return new Response(JSON.stringify({ type: 'data', nodes }) + '\n', {
				headers: { 'Content-Type': 'application/json' }
			});
		}
	};
	installNetworkControl(page, { mode: 'load-error', ordinal: 1, suffix, sameOrigin: true });
	await page.fetch('/admin/feedback/__data.json?x-sveltekit-invalidated=001');
	assert.equal(page.__mapNetwork.calls.length, 0);
	const failed = await page.fetch(`${suffix}?x-sveltekit-invalidated=001`);
	assert.equal(reads, 1);
	assert.equal(failed.status, 200);
	const envelope = JSON.parse((await failed.text()).split('\n')[0]);
	assert.deepEqual(envelope.nodes.slice(0, 2), nodes.slice(0, 2));
	assert.deepEqual(envelope.nodes[2], { type: 'error', status: 503, error: { message: 'Synthetic request failure' } });
	assert.equal(page.__mapNetwork.calls[0].failure, 'page-load');
	const retried = JSON.parse((await (await page.fetch(`${suffix}?x-sveltekit-invalidated=001`)).text()).split('\n')[0]);
	assert.deepEqual(retried.nodes, nodes);
	assert.equal(reads, 2);
});
