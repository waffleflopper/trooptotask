import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRangeCoordinator } from './CalendarRangeCoordinator.svelte';
import type { CalendarRangeData } from '$features/calendar/calendar.types';

const may = { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' };

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
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30'
		});

		coordinator.includeBootstrap({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-05-31'
		});

		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' });
	});

	it('applies the loaded range to bootstrap output', () => {
		const bootstrap = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31'
		};

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual({
			...bootstrap
		});

		coordinator.includeBootstrap({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30'
		});

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30'
		});
	});

	it('loads missing visible ranges, merges them into stores, and extends the loaded envelope', async () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30'
		});
		loadRange.mockResolvedValueOnce(makeRangeData());

		await coordinator.ensureRange('org-1', may);

		expect(loadRange).toHaveBeenCalledWith('org-1', { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' });
		expect(mergeRangeIntoStores).toHaveBeenCalledWith(
			'org-1',
			expect.objectContaining({ rangeStart: '2026-05-01' }),
			expect.anything()
		);
		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' });
		expect(coordinator.loading).toBe(false);
		expect(coordinator.error).toBeNull();
	});

	it('does not reload the same failed range until retry is requested', async () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30'
		});
		loadRange.mockRejectedValueOnce(new Error('network down'));

		await coordinator.ensureRange('org-1', may);
		await coordinator.ensureRange('org-1', may);

		expect(loadRange).toHaveBeenCalledTimes(1);
		expect(coordinator.error?.message).toBe('network down');
		expect(coordinator.status(may)).toBe('error');

		loadRange.mockResolvedValueOnce(makeRangeData());
		coordinator.retryFailedRange();
		await coordinator.ensureRange('org-1', may);

		expect(loadRange).toHaveBeenCalledTimes(2);
		expect(coordinator.error).toBeNull();
		expect(coordinator.status(may)).toBe('ready');
	});

	it('abandons an in-flight range load when explicitly cancelled', async () => {
		let resolveRange: ((value: CalendarRangeData) => void) | undefined;
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30'
		});
		loadRange.mockImplementationOnce(
			() =>
				new Promise<CalendarRangeData>((resolve) => {
					resolveRange = resolve;
				})
		);

		const loadPromise = coordinator.ensureRange('org-1', may);
		expect(coordinator.loading).toBe(true);

		coordinator.cancelInFlightLoads();
		resolveRange?.(makeRangeData());
		await loadPromise;

		expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		expect(coordinator.loading).toBe(false);
		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' });
	});

	it('reads exactly a far disjoint span and stops treating the earlier span as loaded', async () => {
		const april = { rangeStart: '2026-03-01', rangeEnd: '2026-04-30' };
		const farMonth = { rangeStart: '2028-01-02', rangeEnd: '2028-04-30' };
		coordinator.includeBootstrap(april);
		loadRange.mockResolvedValueOnce(makeRangeData(farMonth));

		await coordinator.ensureRange('org-1', farMonth);

		expect(loadRange.mock.calls).toEqual([['org-1', farMonth]]);
		expect(coordinator.loadedRange).toEqual(farMonth);
		expect(coordinator.status(farMonth)).toBe('ready');
		expect(coordinator.status(april)).toBe('loading');
	});

	it('does not claim the days between a disjoint bootstrap and the loaded span', () => {
		coordinator.includeBootstrap({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' });
		coordinator.includeBootstrap({ rangeStart: '2027-01-01', rangeEnd: '2027-02-28' });

		expect(coordinator.loadedRange).toEqual({ rangeStart: '2027-01-01', rangeEnd: '2027-02-28' });
		expect(coordinator.status({ rangeStart: '2026-06-01', rangeEnd: '2026-06-30' })).toBe('loading');
		expect(coordinator.status({ rangeStart: '2027-01-15', rangeEnd: '2027-02-15' })).toBe('ready');
	});

	it('reads a span over 366 days in bounded chunks, two at a time, and covers it once every chunk arrives', async () => {
		const pending: Array<{ range: { rangeStart: string; rangeEnd: string }; resolve: () => void }> = [];
		loadRange.mockImplementation(
			(_orgId: string, range: { rangeStart: string; rangeEnd: string }) =>
				new Promise<CalendarRangeData>((resolve) => {
					pending.push({ range, resolve: () => resolve(makeRangeData(range)) });
				})
		);

		const load = coordinator.ensureRange('org-1', { rangeStart: '2026-01-01', rangeEnd: '2028-03-10' });

		expect(pending.map((call) => call.range)).toEqual([
			{ rangeStart: '2026-01-01', rangeEnd: '2027-01-01' },
			{ rangeStart: '2027-01-02', rangeEnd: '2028-01-02' }
		]);
		pending[0].resolve();
		await vi.waitFor(() => expect(pending).toHaveLength(3));
		expect(pending[2].range).toEqual({ rangeStart: '2028-01-03', rangeEnd: '2028-03-10' });
		pending[2].resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		expect(coordinator.status({ rangeStart: '2026-01-01', rangeEnd: '2026-01-31' })).toBe('loading');

		pending[1].resolve();
		await load;

		expect(mergeRangeIntoStores.mock.calls.map(([, data]) => data.rangeStart).sort()).toEqual([
			'2026-01-01',
			'2027-01-02',
			'2028-01-03'
		]);
		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-01-01', rangeEnd: '2028-03-10' });
		expect(coordinator.loading).toBe(false);
	});

	it('covers a request whose gap before the loaded span exceeds 366 days and which also extends past it', async () => {
		const requested = { rangeStart: '2025-01-01', rangeEnd: '2026-12-31' };
		coordinator.includeBootstrap({ rangeStart: '2026-07-03', rangeEnd: '2026-11-30' });
		loadRange.mockImplementation(async (_orgId: string, range: { rangeStart: string; rangeEnd: string }) =>
			makeRangeData(range)
		);

		await coordinator.ensureRange('org-1', requested);

		expect(coordinator.loadedRange).toEqual(requested);
		expect(coordinator.status(requested)).toBe('ready');
		expect(coordinator.loading).toBe(false);
	});

	it('keeps the loaded span when a far read returns after a covered range was requested', async () => {
		const loaded = { rangeStart: '2026-07-03', rangeEnd: '2026-11-30' };
		const far = { rangeStart: '2028-06-01', rangeEnd: '2028-06-03' };
		const covered = { rangeStart: '2026-10-05', rangeEnd: '2026-10-07' };
		coordinator.includeBootstrap(loaded);
		let finishFar!: () => void;
		loadRange.mockImplementationOnce(
			() =>
				new Promise<CalendarRangeData>((resolve) => {
					finishFar = () => resolve(makeRangeData(far));
				})
		);

		const farLoad = coordinator.ensureRange('org-1', far);
		await coordinator.ensureRange('org-1', covered);
		finishFar();
		await farLoad;

		expect(coordinator.loadedRange).toEqual(loaded);
		expect(coordinator.status(covered)).toBe('ready');
		expect(coordinator.loading).toBe(false);
	});
});
