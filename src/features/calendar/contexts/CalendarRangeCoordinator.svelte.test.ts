import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRangeCoordinator } from './CalendarRangeCoordinator.svelte';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';

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
		vi.clearAllMocks();
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

		await coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});

		expect(loadRange).toHaveBeenCalledWith('org-1', { rangeStart: '2026-05-01', rangeEnd: '2026-05-31' });
		expect(mergeRangeIntoStores).toHaveBeenCalledWith('org-1', expect.objectContaining({ rangeStart: '2026-05-01' }));
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

		await coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});
		await coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});

		expect(loadRange).toHaveBeenCalledTimes(1);
		expect(coordinator.error?.message).toBe('network down');

		loadRange.mockResolvedValueOnce(makeRangeData());
		coordinator.retryFailedRange();
		await coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});

		expect(loadRange).toHaveBeenCalledTimes(2);
		expect(coordinator.error).toBeNull();
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

		const loadPromise = coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});
		expect(coordinator.loading).toBe(true);

		coordinator.cancelInFlightLoads();
		resolveRange?.(makeRangeData());
		await loadPromise;

		expect(mergeRangeIntoStores).not.toHaveBeenCalled();
		expect(coordinator.loading).toBe(false);
		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-04-30' });
	});
});
