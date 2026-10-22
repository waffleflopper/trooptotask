// @vitest-environment happy-dom
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { PlannerRosterRead } from './PlannerRosterRead.svelte';

const month = { orgId: 'org-1', month: '2026-10', today: '2026-10-16' };
const day = { orgId: 'org-1', typeId: 'type-sd', date: '2026-10-20', today: '2026-10-16' };
const rosterDay = { track: null, pool: ['p-kim'] };

let calls: string[] = [];
let failRosters = false;
let roots: (() => void)[] = [];

beforeEach(() => {
	calls = [];
	failRosters = false;
	availabilityStore.load([], 'org-1');
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes('/api/duty-rosters')) {
				const query = new URL(url, 'http://app').searchParams;
				calls.push(url.includes('/day?') ? `day ${query.get('date')}` : `month ${query.get('month')}`);
				if (failRosters) return new Response('down', { status: 503 });
				return Response.json(url.includes('/day?') ? rosterDay : []);
			}
			return Response.json({ id: 'entry-1', ...JSON.parse(String(init?.body)) });
		})
	);
});
afterEach(() => {
	for (const stop of roots) stop();
	roots = [];
	vi.unstubAllGlobals();
});

/** Builds the read as a component would, with its write watch running, and returns it after `setup` runs. */
function mount(setup: (read: PlannerRosterRead) => void = () => {}) {
	let read!: PlannerRosterRead;
	roots.push(
		$effect.root(() => {
			read = new PlannerRosterRead();
			setup(read);
		})
	);
	flushSync();
	return read;
}

const settle = () => vi.waitFor(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('PlannerRosterRead', () => {
	it('waits for Retry after a failed month read instead of reading again', async () => {
		const read = mount();
		failRosters = true;
		read.load(month);
		await vi.waitFor(() => expect(read.status).toBe('error'));

		read.load(month);
		read.load(month);
		await settle();
		expect(calls).toEqual(['month 2026-10']);

		failRosters = false;
		read.retry();
		await vi.waitFor(() => expect(read.status).toBe('ready'));
		expect(calls).toHaveLength(2);
	});

	it('updates a picker that read the day before asking for it', async () => {
		let shown: unknown;
		mount((read) => {
			$effect(() => {
				shown = read.day(day);
			});
			$effect(() => read.loadDay(day));
		});
		await vi.waitFor(() => expect(shown).toEqual({ status: 'ready', day: rosterDay }));
	});

	it('reads a roster day once, and again after a confirmed write, while a failed day waits for Retry', async () => {
		const read = mount();
		read.load(month);
		read.loadDay(day);
		await vi.waitFor(() => expect(read.day(day)).toEqual({ status: 'ready', day: rosterDay }));
		read.loadDay(day);
		await settle();
		expect(calls).toEqual(['month 2026-10', 'day 2026-10-20']);

		await availabilityStore.add({
			personnelId: 'p-kim',
			statusTypeId: 'leave',
			startDate: '2026-10-20',
			endDate: '2026-10-20'
		});
		flushSync();
		read.loadDay(day);
		await vi.waitFor(() => expect(calls).toHaveLength(4));
		expect(calls.slice(2).sort()).toEqual(['day 2026-10-20', 'month 2026-10']);

		failRosters = true;
		const other = { ...day, date: '2026-10-21' };
		read.loadDay(other);
		await vi.waitFor(() => expect(read.day(other)).toEqual({ status: 'error' }));
		read.loadDay(other);
		await settle();
		expect(calls).toHaveLength(5);

		failRosters = false;
		read.retryDay(other);
		await vi.waitFor(() => expect(read.day(other)).toEqual({ status: 'ready', day: rosterDay }));
	});

	it('keeps the shown roster day but marks it stale when a refresh after a write fails, until Retry succeeds', async () => {
		const read = mount();
		read.loadDay(day);
		await vi.waitFor(() => expect(read.day(day)).toEqual({ status: 'ready', day: rosterDay }));

		failRosters = true;
		await availabilityStore.add({
			personnelId: 'p-kim',
			statusTypeId: 'leave',
			startDate: '2026-10-20',
			endDate: '2026-10-20'
		});
		flushSync();
		read.loadDay(day);
		await vi.waitFor(() => expect(read.day(day)).toEqual({ status: 'ready', day: rosterDay, stale: true }));

		failRosters = false;
		read.retryDay(day);
		await vi.waitFor(() => expect(read.day(day)).toEqual({ status: 'ready', day: rosterDay }));
	});

	it('keeps the shown month counts but marks them stale when a refresh after a write fails', async () => {
		const read = mount();
		read.load(month);
		await vi.waitFor(() => expect(read.status).toBe('ready'));

		failRosters = true;
		await availabilityStore.add({
			personnelId: 'p-kim',
			statusTypeId: 'leave',
			startDate: '2026-10-20',
			endDate: '2026-10-20'
		});
		flushSync();
		await vi.waitFor(() => expect(read.stale).toBe(true));
		expect(read.status).toBe('ready');

		failRosters = false;
		read.retry();
		await vi.waitFor(() => expect(read.stale).toBe(false));
	});
});
