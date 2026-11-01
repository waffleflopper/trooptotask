import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrorReferences, takeFreshErrorReference } from '$lib/stores/errorReportLedger';
import { DUPLICATE_WINDOW_MS, MAX_REPORTS_PER_PAGE, installClientErrorCapture, orgSegmentOf } from './clientCapture';

class FakeWindow extends EventTarget {
	location = {
		href: 'https://app.example.test/org/alpha/calendar',
		origin: 'https://app.example.test',
		pathname: '/org/alpha/calendar'
	};
	fetch: typeof fetch;
	constructor(fetchImpl: typeof fetch) {
		super();
		this.fetch = fetchImpl;
	}
	emit(type: string, props: object = {}) {
		this.dispatchEvent(Object.assign(new Event(type), props));
	}
}

const REFERENCE = 'a0000000-0000-4000-8000-000000190001';
let clock = 1_000_000;
const sent = vi.fn();

function setup(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (/\/api\/errors$/.test(url)) {
			sent(url, JSON.parse(String(init?.body)));
			return new Response(JSON.stringify({ reference: REFERENCE }), { status: 200 });
		}
		return respond(url, init);
	}) as unknown as typeof fetch;
	const win = new FakeWindow(network);
	const capture = installClientErrorCapture(win, { routeId: () => '/org/[orgId]/calendar', now: () => clock });
	return { win, capture };
}

beforeEach(() => {
	sent.mockReset();
	clearErrorReferences();
	clock = 1_000_000;
});
afterEach(() => clearErrorReferences());

describe('reading the organization from the path', () => {
	it.each([
		['/org/alpha/calendar', 'alpha'],
		['/org/alpha', 'alpha'],
		['/dashboard', null],
		['/organization', null]
	])('%s is %s', (pathname, expected) => {
		expect(orgSegmentOf(pathname)).toBe(expected);
	});
});

describe('watching requests', () => {
	it('remembers the reference a failed response carries, for the failure toast', async () => {
		const { win } = setup(() => new Response('{}', { status: 500, headers: { 'x-error-reference': REFERENCE } }));

		const response = await win.fetch('/org/alpha/api/availability', { method: 'POST' });

		expect(response.status).toBe(500);
		expect(takeFreshErrorReference('alpha', clock)).toBe(REFERENCE);
		expect(sent).not.toHaveBeenCalled();
	});

	it('does not report a 4xx', async () => {
		const { win } = setup(() => new Response('{}', { status: 403 }));

		await win.fetch('/org/alpha/api/availability', { method: 'POST' });

		expect(takeFreshErrorReference('alpha', clock)).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});

	it('reports a request that never got an answer as a transport failure, and rethrows it', async () => {
		const failure = new TypeError('Failed to fetch');
		const { win } = setup(() => Promise.reject(failure));

		await expect(win.fetch('/org/alpha/api/personnel')).rejects.toBe(failure);

		expect(sent).toHaveBeenCalledWith('/org/alpha/api/errors', {
			kind: 'transport',
			routeId: '/org/[orgId]/calendar',
			name: 'TypeError',
			message: 'Failed to fetch',
			method: 'GET',
			status: null
		});
		await expect(takeFreshErrorReference('alpha', clock)).resolves.toBe(REFERENCE);
	});

	it('reports a write whose result it never saw as unconfirmed', async () => {
		const { win } = setup(() => Promise.reject(new TypeError('Failed to fetch')));

		await expect(win.fetch('/org/alpha/api/availability', { method: 'PUT' })).rejects.toBeTruthy();

		expect(sent).toHaveBeenCalledWith(
			'/org/alpha/api/errors',
			expect.objectContaining({ kind: 'unconfirmed_write', method: 'PUT' })
		);
	});

	it('reports a 5xx the server did not name as unconfirmed, with its status', async () => {
		const { win } = setup(() => new Response('Gateway Timeout', { status: 504 }));

		await win.fetch('/org/alpha/api/availability', { method: 'POST' });

		expect(sent).toHaveBeenCalledWith(
			'/org/alpha/api/errors',
			expect.objectContaining({ kind: 'unconfirmed_write', status: 504 })
		);
	});

	it('ignores an aborted request', async () => {
		const controller = new AbortController();
		const { win } = setup(() => Promise.reject(new DOMException('Aborted', 'AbortError')));
		controller.abort();

		await expect(win.fetch('/org/alpha/api/personnel', { signal: controller.signal })).rejects.toBeTruthy();

		expect(sent).not.toHaveBeenCalled();
	});

	it('ignores requests that fail while the page is being left, until it returns', async () => {
		const { win } = setup(() => Promise.reject(new TypeError('Failed to fetch')));

		win.emit('pagehide');
		await expect(win.fetch('/org/alpha/api/personnel')).rejects.toBeTruthy();
		expect(sent).not.toHaveBeenCalled();

		win.emit('pageshow');
		await expect(win.fetch('/org/alpha/api/personnel')).rejects.toBeTruthy();
		expect(sent).toHaveBeenCalledTimes(1);
	});

	it('does not report a failed request to another origin', async () => {
		const { win } = setup(() => Promise.reject(new TypeError('Failed to fetch')));

		await expect(win.fetch('https://api.other.test/data')).rejects.toBeTruthy();

		expect(sent).not.toHaveBeenCalled();
	});

	it('does not report a failure of the report endpoint itself', async () => {
		const network = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		}) as unknown as typeof fetch;
		const win = new FakeWindow(network);
		installClientErrorCapture(win, { routeId: () => '/org/[orgId]/calendar', now: () => clock });

		await expect(win.fetch('/org/alpha/api/errors', { method: 'POST', body: '{}' })).rejects.toBeTruthy();

		expect(network).toHaveBeenCalledTimes(1);
	});

	it('restores the original fetch when uninstalled', async () => {
		const { win, capture } = setup(() => new Response('{}'));
		const instrumented = win.fetch;

		capture.uninstall();

		expect(win.fetch).not.toBe(instrumented);
	});
});

describe('watching the page', () => {
	it('reports a script error from this origin as a render failure', () => {
		const { win } = setup(() => new Response('{}'));

		win.emit('error', {
			error: new RangeError('Invalid array length'),
			filename: 'https://app.example.test/_app/chunk.js'
		});

		expect(sent).toHaveBeenCalledWith(
			'/org/alpha/api/errors',
			expect.objectContaining({ kind: 'render', name: 'RangeError', message: 'Invalid array length' })
		);
	});

	it('ignores a script error from another origin, such as an extension', () => {
		const { win } = setup(() => new Response('{}'));

		win.emit('error', { error: new Error('injected'), filename: 'chrome-extension://abc/content.js' });

		expect(sent).not.toHaveBeenCalled();
	});

	it('reports an unhandled rejection unless the caller says it is already handled', () => {
		const { win } = setup(() => new Response('{}'));
		win.emit('unhandledrejection', { reason: new Error('Lost promise') });
		expect(sent).toHaveBeenCalledTimes(1);

		const ignoring = new FakeWindow((async () => new Response('{}')) as unknown as typeof fetch);
		installClientErrorCapture(ignoring, { routeId: () => null, ignoreRejection: () => true });
		ignoring.emit('unhandledrejection', { reason: new Error('Handled elsewhere') });
		expect(sent).toHaveBeenCalledTimes(1);
	});
});

describe('limits', () => {
	it('sends the same failure once within the window and again after it', async () => {
		const { win } = setup(() => Promise.reject(new TypeError('Failed to fetch')));

		for (let attempt = 0; attempt < 3; attempt++) await win.fetch('/org/alpha/api/personnel').catch(() => {});
		expect(sent).toHaveBeenCalledTimes(1);

		clock += DUPLICATE_WINDOW_MS + 1;
		await win.fetch('/org/alpha/api/personnel').catch(() => {});
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('stops after the page cap', async () => {
		const { win } = setup((url) =>
			Promise.reject(new TypeError(`Failed ${url.replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)])}`))
		);

		for (let index = 0; index < MAX_REPORTS_PER_PAGE + 5; index++) {
			await win.fetch(`/org/alpha/api/resource-${index}`).catch(() => {});
		}

		expect(sent).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
	});

	it('sends a sanitized message, not the raw one', async () => {
		const { win } = setup(() => Promise.reject(new TypeError('Failed for jane@example.test')));

		await win.fetch('/org/alpha/api/personnel').catch(() => {});

		expect(JSON.stringify(sent.mock.calls)).not.toContain('jane@example.test');
	});
});
