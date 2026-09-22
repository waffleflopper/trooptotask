import type { CalendarBootstrap, CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import { untrack } from 'svelte';
import {
	createVisibleCalendarRange,
	getCalendarRangeGaps,
	type CalendarBufferedRange,
	type CalendarViewMode
} from '$features/calendar/utils/calendarRange';
import { loadCalendarRange, mergeCalendarRangeIntoStores } from '$features/calendar/utils/calendarRangeLoader';

type CalendarBootstrapRangeData = Pick<CalendarBootstrap, 'rangeStart' | 'rangeEnd'>;

interface CalendarRangeCoordinatorDeps {
	loadRange?: typeof loadCalendarRange;
	mergeRangeIntoStores?: typeof mergeCalendarRangeIntoStores;
}

interface LoadVisibleRangeInput {
	orgId: string;
	canViewCalendar: boolean;
	currentDate: Date;
	viewMode: CalendarViewMode;
}

export class CalendarRangeCoordinator {
	loadedRange = $state<CalendarBufferedRange | null>(null);
	loading = $state(false);
	error = $state<Error | null>(null);
	retryToken = $state(0);

	#pendingRangeKey = $state<string | null>(null);
	#failedRangeKey = $state<string | null>(null);
	#requestSerial = 0;
	readonly #loadRange: typeof loadCalendarRange;
	readonly #mergeRangeIntoStores: typeof mergeCalendarRangeIntoStores;

	constructor(deps: CalendarRangeCoordinatorDeps = {}) {
		this.#loadRange = deps.loadRange ?? loadCalendarRange;
		this.#mergeRangeIntoStores = deps.mergeRangeIntoStores ?? mergeCalendarRangeIntoStores;
	}

	reset(): void {
		this.loadedRange = null;
		this.#pendingRangeKey = null;
		this.#failedRangeKey = null;
		this.loading = false;
		this.error = null;
		this.cancelInFlightLoads();
	}

	cancelInFlightLoads(): void {
		this.#requestSerial += 1;
		this.#pendingRangeKey = null;
		this.loading = false;
	}

	includeBootstrap(bootstrap: CalendarBootstrapRangeData): void {
		const currentLoadedRange = untrack(() => this.loadedRange);

		if (bootstrap.rangeStart && bootstrap.rangeEnd) {
			this.loadedRange = currentLoadedRange
				? {
						rangeStart:
							bootstrap.rangeStart < currentLoadedRange.rangeStart
								? bootstrap.rangeStart
								: currentLoadedRange.rangeStart,
						rangeEnd:
							bootstrap.rangeEnd > currentLoadedRange.rangeEnd ? bootstrap.rangeEnd : currentLoadedRange.rangeEnd
					}
				: {
						rangeStart: bootstrap.rangeStart,
						rangeEnd: bootstrap.rangeEnd
					};
		}
	}

	applyToBootstrap<TBootstrap extends CalendarBootstrapRangeData>(bootstrap: TBootstrap): TBootstrap {
		return {
			...bootstrap,
			rangeStart: this.loadedRange?.rangeStart ?? bootstrap.rangeStart,
			rangeEnd: this.loadedRange?.rangeEnd ?? bootstrap.rangeEnd
		};
	}

	retryFailedRange(): void {
		this.error = null;
		this.#failedRangeKey = null;
		this.retryToken += 1;
	}

	async loadVisibleRange(input: LoadVisibleRangeInput): Promise<void> {
		const loadedRange = untrack(() => this.loadedRange);
		if (!input.canViewCalendar || !loadedRange) {
			return;
		}

		const nextRanges = getCalendarRangeGaps(loadedRange, createVisibleCalendarRange(input.currentDate, input.viewMode));

		if (nextRanges.length === 0) {
			this.#pendingRangeKey = null;
			this.#failedRangeKey = null;
			this.loading = false;
			this.error = null;
			return;
		}

		const requestKey = nextRanges.map((range) => `${range.rangeStart}:${range.rangeEnd}`).join('|');
		const pendingRangeKey = untrack(() => this.#pendingRangeKey);
		const failedRangeKey = untrack(() => this.#failedRangeKey);
		if (pendingRangeKey === requestKey || failedRangeKey === requestKey) {
			return;
		}

		this.loading = true;
		this.error = null;
		this.#pendingRangeKey = requestKey;
		const requestSerial = ++this.#requestSerial;

		try {
			const rangeDataSets = await Promise.all(nextRanges.map((range) => this.#loadRange(input.orgId, range)));
			if (requestSerial !== this.#requestSerial) {
				return;
			}

			this.#mergeRangeDataSets(input.orgId, rangeDataSets);
			this.loading = false;
			this.#failedRangeKey = null;
			this.#pendingRangeKey = null;
		} catch (error) {
			if (requestSerial !== this.#requestSerial) {
				return;
			}

			this.error = error instanceof Error ? error : new Error('Failed to load calendar range');
			this.loading = false;
			this.#failedRangeKey = requestKey;
			this.#pendingRangeKey = null;
		}
	}

	#mergeRangeDataSets(orgId: string, rangeDataSets: CalendarRangeData[]): void {
		for (const rangeData of rangeDataSets) {
			const loadedRange = untrack(() => this.loadedRange);
			this.#mergeRangeIntoStores(orgId, rangeData);
			this.loadedRange = loadedRange
				? {
						rangeStart: rangeData.rangeStart < loadedRange.rangeStart ? rangeData.rangeStart : loadedRange.rangeStart,
						rangeEnd: rangeData.rangeEnd > loadedRange.rangeEnd ? rangeData.rangeEnd : loadedRange.rangeEnd
					}
				: {
						rangeStart: rangeData.rangeStart,
						rangeEnd: rangeData.rangeEnd
					};
		}
	}
}
