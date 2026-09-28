import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installNetworkControl } from './network-control.mjs';

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
		suffix: '/api/calendar-range'
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
