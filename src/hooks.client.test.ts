import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreRequestError } from '$lib/stores/core/ports';
import { handleError, init } from './hooks.client';

vi.mock('$app/state', () => ({ page: { route: { id: '/org/[orgId]/calendar' } } }));

class FakeWindow extends EventTarget {
	location = {
		href: 'https://app.example.test/org/alpha/calendar',
		origin: 'https://app.example.test',
		pathname: '/org/alpha/calendar'
	};
	fetch: typeof fetch = network;
}

const network = vi.fn(
	async (..._args: unknown[]) => new Response(JSON.stringify({ reference: 'ref-1' }), { status: 200 })
);

let win: FakeWindow;

function reportsSent() {
	return network.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

const navigation: { event: never } = { event: {} as never };

beforeEach(() => {
	network.mockClear();
	win = new FakeWindow();
	vi.stubGlobal('window', win);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	init();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('client error hook', () => {
	it('reports an unknown error thrown while rendering, and logs it', () => {
		const error = new TypeError("Cannot read properties of undefined (reading 'name')");

		handleError({ kind: 'unknown', error, ...navigation });

		expect(console.error).toHaveBeenCalledWith(error);
		expect(reportsSent()).toEqual([
			{
				kind: 'render',
				routeId: '/org/[orgId]/calendar',
				name: 'TypeError',
				message: 'Cannot read properties of undefined (reading ?)',
				method: null,
				status: null
			}
		]);
	});

	it('does not report an error the server already stored under a reference', () => {
		handleError({
			kind: 'app',
			error: { status: 500, message: 'Internal server error', errorReference: 'ref-9' },
			...navigation
		});

		expect(network).not.toHaveBeenCalled();
	});

	it.each([
		['a framework 404', { kind: 'framework', error: { status: 404, message: 'Not Found' } }],
		['an app 403', { kind: 'app', error: { status: 403, message: 'Forbidden' } }]
	])('does not report %s', (_name, input) => {
		handleError({ ...input, ...navigation } as never);

		expect(network).not.toHaveBeenCalled();
	});

	it('reports an app 5xx that no server named', () => {
		handleError({ kind: 'app', error: { status: 502, message: 'Bad gateway' }, ...navigation });

		expect(reportsSent()).toEqual([expect.objectContaining({ kind: 'server_exception', status: 502 })]);
	});

	it('leaves a failed store request to the server record instead of reporting its rejection again', () => {
		win.dispatchEvent(
			Object.assign(new Event('unhandledrejection'), { reason: new StoreRequestError('POST x failed (500)', 500) })
		);

		expect(network).not.toHaveBeenCalled();
	});
});
