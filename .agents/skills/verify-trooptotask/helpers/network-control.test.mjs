import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installNetworkControl } from './network-control.mjs';
import { parse } from 'devalue';

function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

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
	const failure = await page.fetch('/org/a/settings/general?/updateSlug', { method: 'POST' });
	assert.equal(failure.status, 503);
	const result = await failure.json();
	assert.equal(result.type, 'failure');
	assert.equal(result.status, 503);
	assert.deepEqual(parse(result.data), { slugError: 'Synthetic request failure' });
	assert.equal(page.__mapNetwork.calls.length, 1);
	assert.equal((await page.fetch('/org/a/settings/general?/updateSlug', { method: 'POST' })).status, 200);
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
