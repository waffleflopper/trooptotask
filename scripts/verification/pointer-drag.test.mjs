import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointerDrag } from './pointer-drag.mjs';

const origin = 'http://127.0.0.1:43210';
const calendarUrl = `${origin}/org/synthetic-a/calendar`;
const endpoint = 'ws://127.0.0.1:43211/devtools/browser/11111111-1111-1111-1111-111111111111';

function fixture({ boxes = {}, nativePages = [{ id: 2, url: calendarUrl }] } = {}) {
	const moves = [];
	const resources = { disconnected: false };
	const layout = {
		'[data-edge="end"]': [{ x: 400, y: 120, width: 8, height: 12 }],
		'[data-day="9"]': [{ x: 480, y: 110, width: 40, height: 36 }],
		...boxes
	};
	const page = {
		url: () => calendarUrl,
		isClosed: () => false,
		evaluate: async () => [1440, 900],
		$$: async (selector) => (layout[selector] ?? []).map((box) => ({ boundingBox: async () => box })),
		mouse: {
			move: async (x, y, options) => moves.push(['move', x, y, options?.steps ?? 1]),
			down: async () => moves.push(['down']),
			up: async () => moves.push(['up'])
		}
	};
	const browser = {
		pages: async () => [{ url: () => `${origin}/org/synthetic-b/calendar`, isClosed: () => false }, page],
		disconnect: async () => {
			resources.disconnected = true;
		}
	};
	const options = {
		inspectOwnership: async () => endpoint,
		connect: async (connection) => {
			assert.equal(connection.browserWSEndpoint, endpoint);
			return browser;
		}
	};
	const context = (input) => ({
		state: { origin },
		session: '/unused',
		input: { command: 'pointer-drag', pageId: 2, expectedUrl: calendarUrl, ...input },
		call: async (name) => {
			assert.equal(name, 'list_pages');
			return { structuredContent: { pages: nativePages } };
		}
	});
	return { moves, resources, run: (input) => pointerDrag(context(input), options) };
}

test('drags with real pointer input from one element centre to another', async () => {
	const { moves, resources, run } = fixture();

	const result = await run({ from: '[data-edge="end"]', to: '[data-day="9"]', steps: 4 });

	assert.deepEqual(moves, [['move', 404, 126, 1], ['down'], ['move', 500, 128, 4], ['up']]);
	assert.deepEqual(result, {
		status: 'PASS',
		pageId: 2,
		url: calendarUrl,
		from: { selector: '[data-edge="end"]', x: 404, y: 126 },
		to: { selector: '[data-day="9"]', x: 500, y: 128 },
		steps: 4
	});
	assert.equal(resources.disconnected, true);
});

test('refuses an ambiguous, hidden or off-screen target without pressing', async () => {
	for (const [boxes, message] of [
		[{ '[data-day="9"]': [] }, /must match exactly one/],
		[{ '[data-day="9"]': [{ x: 0, y: 0, width: 0, height: 0 }] }, /not rendered/],
		[{ '[data-day="9"]': [{ x: 1500, y: 110, width: 40, height: 36 }] }, /outside the viewport/]
	]) {
		const { moves, resources, run } = fixture({ boxes });

		await assert.rejects(run({ from: '[data-edge="end"]', to: '[data-day="9"]' }), message);
		assert.deepEqual(moves, []);
		assert.equal(resources.disconnected, true);
	}
});

test('refuses a page the native browser does not identify by the same ID and URL', async () => {
	const { moves, run } = fixture({ nativePages: [{ id: 3, url: calendarUrl }] });

	await assert.rejects(run({ from: '[data-edge="end"]', to: '[data-day="9"]' }), { code: 'DRAG_PAGE' });
	assert.deepEqual(moves, []);
});

test('refuses a URL outside the owned app and malformed input', async () => {
	const { run } = fixture();

	await assert.rejects(run({ expectedUrl: 'https://example.com/calendar', from: 'a', to: 'b' }), { code: 'DRAG_URL' });
	await assert.rejects(run({ from: '', to: 'b' }), { code: 'DRAG_INPUT' });
	await assert.rejects(run({ from: 'a', to: 'b', steps: 0 }), { code: 'DRAG_INPUT' });
});
