import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import './preview-streaming.mjs';

test('app requests reach the preview without an encoding offer while immutable assets keep theirs', async () => {
	const server = createServer((request, response) => response.end(request.headers['accept-encoding'] ?? 'none'));
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const origin = `http://127.0.0.1:${server.address().port}`;
	const offered = (path) => fetch(origin + path, { headers: { 'accept-encoding': 'gzip' } }).then((r) => r.text());
	try {
		assert.equal(await offered('/org/x/critical-tasks/reports'), 'none');
		assert.equal(await offered('/org/x/__data.json'), 'none');
		assert.equal(await offered('/_app/immutable/entry/start.js'), 'gzip');
	} finally {
		server.close();
	}
});
