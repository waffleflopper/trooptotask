import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarRangeCoordinator } from './CalendarRangeCoordinator.svelte';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

function makeDutyEvent(
	id: string,
	coverageStart = '2026-04-01T08:00:00',
	overrides: Partial<DutyEvent> = {}
): DutyEvent {
	const eventDate = coverageStart.slice(0, 10);

	return {
		id,
		orgId: 'org-1',
		runId: null,
		templateId: 'tmpl-1',
		templateName: 'Staff Duty',
		eventDate,
		coverageMode: 'timed',
		coverageStart,
		coverageEnd: `${eventDate}T20:00:00`,
		isBlocking: true,
		cooldownHours: 24,
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		rulesSnapshot: {
			templateId: 'tmpl-1',
			templateName: 'Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 24,
			softPreferences: [],
			slots: []
		},
		slotInstances: [],
		createdAt: '2026-04-01T00:00:00.000Z',
		updatedAt: '2026-04-01T00:00:00.000Z',
		...overrides
	};
}

function makeRangeData(overrides: Partial<CalendarRangeData> = {}): CalendarRangeData {
	return {
		rangeStart: '2026-05-01',
		rangeEnd: '2026-05-31',
		availabilityEntries: [],
		specialDays: [],
		dailyAssignments: [],
		advancedDutyEvents: [makeDutyEvent('event-from-range', '2026-05-02T08:00:00')],
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

	it('hydrates the loaded envelope and merges advanced duty events from bootstrap data', () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [makeDutyEvent('event-bootstrap')]
		});

		coordinator.includeBootstrap({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-05-31',
			advancedDutyEvents: [
				makeDutyEvent('event-bootstrap', '2026-04-03T08:00:00'),
				makeDutyEvent('event-second', '2026-05-01T08:00:00')
			]
		});

		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-05-31' });
		expect(coordinator.advancedDutyEvents.map((event) => event.id)).toEqual(['event-bootstrap', 'event-second']);
		expect(coordinator.advancedDutyEvents[0].coverageStart).toBe('2026-04-03T08:00:00');
	});

	it('applies coordinator range and duty event state to bootstrap output', () => {
		const bootstrap = {
			rangeStart: '2026-03-01',
			rangeEnd: '2026-03-31',
			advancedDutyEvents: [makeDutyEvent('bootstrap-event')]
		};

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual({
			...bootstrap,
			advancedDutyEvents: []
		});

		coordinator.includeBootstrap({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [makeDutyEvent('coordinator-event')]
		});

		expect(coordinator.applyToBootstrap(bootstrap)).toEqual({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [makeDutyEvent('coordinator-event')]
		});
	});

	it('loads missing visible ranges, merges them into stores, and extends the loaded envelope', async () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [makeDutyEvent('event-bootstrap')]
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
		expect(coordinator.advancedDutyEvents.map((event) => event.id)).toEqual(['event-bootstrap', 'event-from-range']);
	});

	it('replaces advanced duty events inside later loaded ranges while retaining outside events', async () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-04-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [
				makeDutyEvent('stale-spanning-may', '2026-04-30T08:00:00', {
					coverageEnd: '2026-05-01T08:00:00'
				}),
				makeDutyEvent('april-only', '2026-04-10T08:00:00', {
					coverageEnd: '2026-04-10T20:00:00'
				}),
				makeDutyEvent('event-replaced', '2026-04-15T08:00:00', {
					coverageEnd: '2026-04-15T20:00:00',
					templateName: 'Old Staff Duty'
				})
			]
		});
		loadRange.mockResolvedValueOnce(
			makeRangeData({
				advancedDutyEvents: [
					makeDutyEvent('event-replaced', '2026-05-02T08:00:00', {
						coverageEnd: '2026-05-02T20:00:00',
						templateName: 'Updated Staff Duty'
					})
				]
			})
		);

		await coordinator.loadVisibleRange({
			orgId: 'org-1',
			canViewCalendar: true,
			currentDate: new Date(2026, 4, 1),
			viewMode: 'month'
		});

		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-04-01', rangeEnd: '2026-05-31' });
		expect(coordinator.advancedDutyEvents.map((event) => event.id)).toEqual(['april-only', 'event-replaced']);
		expect(coordinator.advancedDutyEvents.find((event) => event.id === 'stale-spanning-may')).toBeUndefined();
		expect(coordinator.advancedDutyEvents.find((event) => event.id === 'event-replaced')).toMatchObject({
			coverageStart: '2026-05-02T08:00:00',
			templateName: 'Updated Staff Duty'
		});
	});

	it('does not reload the same failed range until retry is requested', async () => {
		coordinator.includeBootstrap({
			rangeStart: '2026-03-01',
			rangeEnd: '2026-04-30',
			advancedDutyEvents: []
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
			rangeEnd: '2026-04-30',
			advancedDutyEvents: [makeDutyEvent('event-bootstrap')]
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
		expect(coordinator.advancedDutyEvents.map((event) => event.id)).toEqual(['event-bootstrap']);
	});
});
