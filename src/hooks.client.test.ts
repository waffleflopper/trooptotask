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

const navigationTo = (pathname: string, routeId: string) =>
	({ event: { url: new URL(`https://app.example.test${pathname}`), route: { id: routeId } } }) as never as {
		event: never;
	};
const navigation = navigationTo('/org/alpha/calendar', '/org/[orgId]/calendar');

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

	it('files a failed navigation under its destination, not the page being left', () => {
		handleError({
			kind: 'unknown',
			error: new TypeError('Load failed'),
			...navigationTo('/org/bravo/personnel', '/org/[orgId]/personnel')
		});

		const [url] = network.mock.calls[0];
		expect(url).toBe('/org/bravo/api/errors');
		expect(reportsSent()[0].routeId).toBe('/org/[orgId]/personnel');
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
