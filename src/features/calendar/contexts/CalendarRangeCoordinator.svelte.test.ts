import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRangeCoordinator } from './CalendarRangeCoordinator.svelte';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
import { mergeCalendarRangeIntoStores } from '$features/calendar/utils/calendarRangeLoader';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';

type Range = { rangeStart: string; rangeEnd: string };

const may = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };
const both = (range: Range) => ({ availability: range, assignments: range });
const bootstrapOf = (range: Range, availabilityRange: Range = range) => ({ ...range, availabilityRange });

function makeRangeData(overrides: Partial<CalendarRangeData> = {}): CalendarRangeData {
	return {
		rangeStart: '2026-05-01',
		rangeEnd: '2026-05-31',
		availabilityEntries: [],
		specialDays: [],
		dailyAssignments: [],
		...overrides
	};
}

describe('CalendarRangeCoordinator', () => {
	const loadRange = vi.fn();
	const mergeRangeIntoStores = vi.fn();
	let coordinator: CalendarRangeCoordinator;

	beforeEach(() => {
		vi.resetAllMocks();
		coordinator = new CalendarRangeCoordinator({
			loadRange,
			mergeRangeIntoStores
		});
	});

	it('extends the loaded envelope from bootstrap data', () => {
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));

		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-04-01', rangeEnd: '2026-05-31' }));

		expect(coordinator.loaded).toEqual(both({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' }));
	});

	it('applies each loaded collection span to bootstrap output', () => {
		const bootstrap = bootstrapOf(
			{ rangeStart: '2025-12-02', rangeEnd: '2026-03-31' },
			{ rangeStart: '2026-03-01', rangeEnd: '2026-03-31' }
		);

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual(bootstrap);

		coordinator.includeBootstrap(
			bootstrapOf(
				{ rangeStart: '2026-01-01', rangeEnd: '2026-04-30' },
				{ rangeStart: '2026-04-01', rangeEnd: '2026-04-30' }
			)
		);

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual({
			rangeStart: '2026-01-01',
			rangeEnd: '2026-04-30',
			availabilityRange: { rangeStart: '2026-04-01', rangeEnd: '2026-04-30' }
		});
	});

	it('pages forward with one read for both collections and back with one read per collection', async () => {
		coordinator.includeBootstrap(
			bootstrapOf(
				{ rangeStart: '2026-07-03', rangeEnd: '2026-11-30' },
				{ rangeStart: '2026-10-01', rangeEnd: '2026-11-30' }
			)
		);
		loadRange.mockImplementation(async (_orgId: string, read: Range) => makeRangeData(read));

		await coordinator.ensureRange('org-1', {
			availability: { rangeStart: '2026-12-01', rangeEnd: '2026-12-31' },
			assignments: { rangeStart: '2026-09-02', rangeEnd: '2026-12-31' }
		});
		await coordinator.ensureRange('org-1', {
			availability: { rangeStart: '2026-09-01', rangeEnd: '2026-09-30' },
			assignments: { rangeStart: '2026-06-03', rangeEnd: '2026-09-30' }
		});

		expect(loadRange.mock.calls.map(([, read]) => read)).toEqual([
			{ rangeStart: '2026-12-01', rangeEnd: '2026-12-31', collections: ['availability', 'assignments'] },
			{ rangeStart: '2026-09-01', rangeEnd: '2026-09-30', collections: ['availability'] },
			{ rangeStart: '2026-06-03', rangeEnd: '2026-07-02', collections: ['assignments'] }
		]);
		expect(coordinator.loaded).toEqual({
			availability: { rangeStart: '2026-09-01', rangeEnd: '2026-12-31' },
			assignments: { rangeStart: '2026-06-03', rangeEnd: '2026-12-31' }
		});
	});

	it('loads missing visible ranges, merges them into stores, and extends the loaded envelope', async () => {
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));
		loadRange.mockResolvedValueOnce(makeRangeData());

		await coordinator.ensureRange('org-1', both(may));

		expect(loadRange.mock.calls).toEqual([
			['org-1', { rangeStart: '2026-05-01', rangeEnd: '2026-05-31', collections: ['availability', 'assignments'] }]
		]);
		expect(mergeRangeIntoStores).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({ rangeStart: '2026-05-01' }),
			expect.anything()
		);
		expect(coordinator.loaded).toEqual(both({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' }));
		expect(coordinator.loading).toBe(false);
		expect(coordinator.error).toBeNull();
	});

	it('does not reload the same failed range until retry is requested', async () => {
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));
		loadRange.mockRejectedValueOnce(new Error('network down'));

		await coordinator.ensureRange('org-1', both(may));
		await coordinator.ensureRange('org-1', both(may));

		expect(loadRange).toHaveBeenCalledTimes(1);
		expect(coordinator.error?.message).toBe('network down');
		expect(coordinator.status(both(may))).toBe('error');

		loadRange.mockResolvedValueOnce(makeRangeData());
		coordinator.retryFailedRange();
		await coordinator.ensureRange('org-1', both(may));

		expect(loadRange).toHaveBeenCalledTimes(2);
		expect(coordinator.error).toBeNull();
		expect(coordinator.status(both(may))).toBe('ready');
	});

	it('abandons an in-flight range load when explicitly cancelled', async () => {
		let resolveRange: ((value: CalendarRangeData) => void) | undefined;
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));
		loadRange.mockImplementationOnce(
			() =>
				new Promise<CalendarRangeData>((resolve) => {
					resolveRange = resolve;
				})
		);

		const loadPromise = coordinator.ensureRange('org-1', both(may));
		expect(coordinator.loading).toBe(true);

		coordinator.cancelInFlightLoads();
		resolveRange?.(makeRangeData());
		await loadPromise;

		expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		expect(coordinator.loading).toBe(false);
		expect(coordinator.loaded).toEqual(both({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));
	});

	it('reads exactly a far disjoint span and stops treating the earlier span as loaded', async () => {
		const april = { rangeStart: '2026-03-01', rangeEnd: '2026-04-30' };
		const farMonth = { rangeStart: '2028-01-02', rangeEnd: '2028-04-30' };
		coordinator.includeBootstrap(bootstrapOf(april));
		loadRange.mockResolvedValueOnce(makeRangeData(farMonth));

		await coordinator.ensureRange('org-1', both(farMonth));

		expect(loadRange.mock.calls).toEqual([['org-1', { ...farMonth, collections: ['availability', 'assignments'] }]]);
		expect(coordinator.loaded).toEqual(both(farMonth));
		expect(coordinator.status(both(farMonth))).toBe('ready');
		expect(coordinator.status(both(april))).toBe('loading');
	});

	it('does not claim the days between a disjoint bootstrap and the loaded span', () => {
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' }));
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2027-01-01', rangeEnd: '2027-02-28' }));

		expect(coordinator.loaded).toEqual(both({ rangeStart: '2027-01-01', rangeEnd: '2027-02-28' }));
		expect(coordinator.status(both({ rangeStart: '2026-06-01', rangeEnd: '2026-06-30' }))).toBe('loading');
		expect(coordinator.status(both({ rangeStart: '2027-01-15', rangeEnd: '2027-02-15' }))).toBe('ready');
	});

	it('reads a span over 366 days in bounded chunks, two at a time, and covers it once every chunk arrives', async () => {
		const pending: Array<{ range: { rangeStart: string; rangeEnd: string }; resolve: () => void }> = [];
		loadRange.mockImplementation(
			(_orgId: string, range: Range) =>
				new Promise<CalendarRangeData>((resolve) => {
					pending.push({ range, resolve: () => resolve(makeRangeData(range)) });
				})
		);

		const load = coordinator.ensureRange('org-1', both({ rangeStart: '2026-01-01', rangeEnd: '2028-03-10' }));

		expect(pending.map((call) => call.range)).toEqual([
			{ rangeStart: '2026-01-01', rangeEnd: '2027-01-01', collections: ['availability', 'assignments'] },
			{ rangeStart: '2027-01-02', rangeEnd: '2028-01-02', collections: ['availability', 'assignments'] }
		]);
		pending[0].resolve();
		await vi.waitFor(() => expect(pending).toHaveLength(3));
		expect(pending[2].range).toEqual({
			rangeStart: '2028-01-03',
			rangeEnd: '2028-03-10',
			collections: ['availability', 'assignments']
		});
		pending[2].resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		expect(coordinator.status(both({ rangeStart: '2026-01-01', rangeEnd: '2026-01-31' }))).toBe('loading');

		pending[1].resolve();
		await load;

		expect(mergeRangeIntoStores.mock.calls.map(([, data]) => data.rangeStart).sort()).toEqual([
			'2026-01-01',
			'2027-01-02',
			'2028-01-03'
		]);
		expect(coordinator.loaded).toEqual(both({ rangeStart: '2026-01-01', rangeEnd: '2028-03-10' }));
		expect(coordinator.loading).toBe(false);
	});

	it('covers a request whose gap before the loaded span exceeds 366 days and which also extends past it', async () => {
		const requested = { rangeStart: '2025-01-01', rangeEnd: '2026-12-31' };
		coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-07-03', rangeEnd: '2026-11-30' }));
		loadRange.mockImplementation(async (_orgId: string, range: Range) => makeRangeData(range));

		await coordinator.ensureRange('org-1', both(requested));

		expect(coordinator.loaded).toEqual(both(requested));
		expect(coordinator.status(both(requested))).toBe('ready');
		expect(coordinator.loading).toBe(false);
	});

	it('keeps the loaded span when a far read returns after a covered range was requested', async () => {
		const loaded = { rangeStart: '2026-07-03', rangeEnd: '2026-11-30' };
		const far = { rangeStart: '2028-06-01', rangeEnd: '2028-06-03' };
		const covered = { rangeStart: '2026-10-05', rangeEnd: '2026-10-07' };
		coordinator.includeBootstrap(bootstrapOf(loaded));
		let finishFar!: () => void;
		loadRange.mockImplementationOnce(
			() =>
				new Promise<CalendarRangeData>((resolve) => {
					finishFar = () => resolve(makeRangeData(far));
				})
		);

		const farLoad = coordinator.ensureRange('org-1', both(far));
		await coordinator.ensureRange('org-1', both(covered));
		finishFar();
		await farLoad;

		expect(coordinator.loaded).toEqual(both(loaded));
		expect(coordinator.status(both(covered))).toBe('ready');
		expect(coordinator.loading).toBe(false);
	});

	describe('rereadAssignments', () => {
		const slot = (id: string, assigneeId: string) => ({
			id,
			date: '2026-05-04',
			assignmentTypeId: 'duty',
			assigneeId
		});

		it('merges the refreshed assignments and reports the read', async () => {
			loadRange.mockResolvedValueOnce(makeRangeData({ dailyAssignments: [slot('a', 'p-1')] }));

			const result = await coordinator.rereadAssignments('org-1', { assignments: may });

			expect(result).toBe('read');
			expect(mergeRangeIntoStores).toHaveBeenCalledOnce();
		});

		it('reports a failed read and leaves the stores as they were', async () => {
			loadRange.mockRejectedValueOnce(new Error('offline'));

			const result = await coordinator.rereadAssignments('org-1', { assignments: may });

			expect(result).toBe('failed');
			expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		});

		it('drops a late reply from an Organization the user has left, keeping the new Organization assignments', async () => {
			const real = new CalendarRangeCoordinator({ loadRange, mergeRangeIntoStores: mergeCalendarRangeIntoStores });
			let reply!: (data: CalendarRangeData) => void;
			loadRange.mockImplementationOnce(() => new Promise<CalendarRangeData>((resolve) => (reply = resolve)));

			const pending = real.rereadAssignments('org-old', { assignments: may });
			endOrganizationLifetime();
			dailyAssignmentsStore.load([], [slot('new-1', 'p-new')], 'org-new');
			reply(makeRangeData({ dailyAssignments: [slot('old-1', 'p-old')] }));

			expect(await pending).toBe('abandoned');
			expect(dailyAssignmentsStore.orgId).toBe('org-new');
			expect(dailyAssignmentsStore.items.map((item) => item.id)).toEqual(['new-1']);
		});
	});

	describe('projection', () => {
		const withEvents = { ...both(may), events: may };
		const projection = {
			events: [
				{
					id: 'e1',
					title: 'Field exercise',
					startsOn: '2026-05-04',
					endsOn: '2026-05-06',
					cancelled: false,
					hasWork: false
				}
			],
			suspenses: [],
			commitments: []
		};

		beforeEach(() => {
			coordinator.includeBootstrap(bootstrapOf({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' }));
		});

		it('reads Events beside the days that are missing and keeps what it returns', async () => {
			loadRange.mockResolvedValueOnce(makeRangeData({ projection: { kind: 'loaded', ...projection } }));

			expect(coordinator.projectionStatus(withEvents)).toBe('loading');
			await coordinator.ensureRange('org-1', withEvents);

			expect(loadRange).toHaveBeenCalledTimes(1);
			expect(loadRange.mock.calls[0][1].collections).toEqual(['events']);
			expect(coordinator.projection.events).toEqual(projection.events);
			expect(coordinator.projectionStatus(withEvents)).toBe('ready');
		});

		it('leaves the matrix ready when only the projection failed, and reads again only on retry', async () => {
			loadRange.mockResolvedValueOnce(makeRangeData({ projection: { kind: 'failed' } }));

			await coordinator.ensureRange('org-1', withEvents);
			await coordinator.ensureRange('org-1', withEvents);

			expect(loadRange).toHaveBeenCalledTimes(1);
			expect(coordinator.status(withEvents)).toBe('ready');
			expect(coordinator.projectionStatus(withEvents)).toBe('error');

			loadRange.mockResolvedValueOnce(makeRangeData({ projection: { kind: 'loaded', ...projection } }));
			coordinator.retryFailedRange();
			expect(coordinator.projectionStatus(withEvents)).toBe('loading');
			await coordinator.ensureRange('org-1', withEvents);

			expect(loadRange).toHaveBeenCalledTimes(2);
			expect(coordinator.projectionStatus(withEvents)).toBe('ready');
			expect(coordinator.projection.events).toEqual(projection.events);
		});

		it('asks for no Events when the view does not need them', async () => {
			await coordinator.ensureRange('org-1', both(may));

			expect(loadRange).not.toHaveBeenCalled();
			expect(coordinator.projectionStatus(both(may))).toBe('ready');
		});

		it('forgets the Events it holds when the workspace resets', async () => {
			loadRange.mockResolvedValueOnce(makeRangeData({ projection: { kind: 'loaded', ...projection } }));
			await coordinator.ensureRange('org-1', withEvents);

			coordinator.reset();

			expect(coordinator.projection.events).toEqual([]);
			expect(coordinator.projectionStatus(withEvents)).toBe('loading');
		});
	});
});
