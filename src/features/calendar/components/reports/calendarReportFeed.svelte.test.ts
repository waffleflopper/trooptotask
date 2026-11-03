import { describe, expect, it, vi } from 'vitest';
import type { CalendarReportData } from './calendarReportData';
import { CalendarReportFeed } from './calendarReportFeed.svelte';

function deferred() {
	let resolve!: (data: CalendarReportData) => void;
	let reject!: (cause: unknown) => void;
	const promise = new Promise<CalendarReportData>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const first = { start: '2026-11-03', end: '2026-12-02' };
const second = { start: '2026-12-03', end: '2027-01-01' };
const entry = { id: 'e1', personnelId: 'p1', statusTypeId: 'leave', startDate: first.start, endDate: first.start };

describe('CalendarReportFeed', () => {
	it('loads a span once however often it is asked for', async () => {
		const pending = deferred();
		const fetchData = vi.fn(() => pending.promise);
		const feed = new CalendarReportFeed('org-1', fetchData);

		feed.load(first);
		feed.load(first);
		pending.resolve({ entries: [entry] });
		await pending.promise;
		feed.load(first);

		expect(fetchData).toHaveBeenCalledTimes(1);
		expect(feed.state).toEqual({ status: 'ready', key: '2026-11-03|2026-12-02', data: { entries: [entry] } });
	});

	it('drops the answer for a span that was replaced while it loaded', async () => {
		const slow = deferred();
		const fast = deferred();
		const answers = [slow, fast];
		const feed = new CalendarReportFeed('org-1', () => answers.shift()!.promise);

		feed.load(first);
		feed.load(second);
		fast.resolve({ entries: [] });
		await fast.promise;
		slow.resolve({ entries: [entry] });
		await slow.promise;

		expect(feed.state).toEqual({ status: 'ready', key: '2026-12-03|2027-01-01', data: { entries: [] } });
	});

	it('cancels the request in flight when a new span replaces it', () => {
		const signals: AbortSignal[] = [];
		const feed = new CalendarReportFeed('org-1', (_org, _start, _end, signal) => {
			signals.push(signal);
			return new Promise(() => {});
		});

		feed.load(first);
		feed.load(second);

		expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
	});

	it('writes nothing after it is disposed', async () => {
		const pending = deferred();
		const feed = new CalendarReportFeed('org-1', () => pending.promise);

		feed.load(first);
		feed.dispose();
		pending.resolve({ entries: [entry] });
		await pending.promise;

		expect(feed.state).toEqual({ status: 'loading', key: '2026-11-03|2026-12-02' });
	});

	it('reports a failure for its span and loads again on retry', async () => {
		const failing = deferred();
		const recovering = deferred();
		const answers = [failing, recovering];
		const feed = new CalendarReportFeed('org-1', () => answers.shift()!.promise);

		feed.load(first);
		failing.reject(new Error('Request failed (500)'));
		await failing.promise.catch(() => {});
		expect(feed.state).toEqual({ status: 'error', key: '2026-11-03|2026-12-02', message: 'Request failed (500)' });

		feed.retry();
		expect(feed.state.status).toBe('loading');
		recovering.resolve({ entries: [] });
		await recovering.promise;
		expect(feed.state.status).toBe('ready');
	});
});
