import type { CalendarBootstrap, CalendarRangeData } from '$features/calendar/calendar.types';
import { untrack } from 'svelte';
import {
	chunkCalendarReadRange,
	extendLoadedRange,
	getCalendarRangeGaps,
	type CalendarBufferedRange
} from '$features/calendar/utils/calendarRange';
import {
	beginCalendarRangeRead,
	loadCalendarRange,
	mergeCalendarRangeIntoStores,
	type CalendarRangeRead
} from '$features/calendar/utils/calendarRangeLoader';

type CalendarBootstrapRangeData = Pick<CalendarBootstrap, 'rangeStart' | 'rangeEnd'>;

interface CalendarRangeCoordinatorDeps {
	loadRange?: typeof loadCalendarRange;
	mergeRangeIntoStores?: typeof mergeCalendarRangeIntoStores;
}

export type CalendarRangeStatus = 'ready' | 'loading' | 'error';

const MAX_READS_IN_FLIGHT = 2;

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
		if (bootstrap.rangeStart && bootstrap.rangeEnd) {
			this.loadedRange = extendLoadedRange(
				untrack(() => this.loadedRange),
				{ rangeStart: bootstrap.rangeStart, rangeEnd: bootstrap.rangeEnd }
			);
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

	status(range: CalendarBufferedRange): CalendarRangeStatus {
		if (getCalendarRangeGaps(this.loadedRange, range).length === 0) return 'ready';
		return this.error ? 'error' : 'loading';
	}

	/** Reads whatever part of `range` is not loaded yet. Callers check view capability first. */
	async ensureRange(orgId: string, range: CalendarBufferedRange): Promise<void> {
		const nextRanges = getCalendarRangeGaps(
			untrack(() => this.loadedRange),
			range
		).flatMap(chunkCalendarReadRange);

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
		const read = beginCalendarRangeRead();

		try {
			const rangeDataSets = await this.#readRanges(orgId, nextRanges, requestSerial);
			if (requestSerial !== this.#requestSerial) {
				return;
			}

			this.#mergeRangeDataSets(orgId, rangeDataSets, read);
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
		} finally {
			read.close();
		}
	}

	async #readRanges(
		orgId: string,
		ranges: CalendarBufferedRange[],
		requestSerial: number
	): Promise<CalendarRangeData[]> {
		const results: CalendarRangeData[] = [];
		let next = 0;
		let failed = false;
		const readNext = async (): Promise<void> => {
			while (!failed && next < ranges.length && requestSerial === this.#requestSerial) {
				const index = next++;
				try {
					results[index] = await this.#loadRange(orgId, ranges[index]);
				} catch (error) {
					failed = true;
					throw error;
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(MAX_READS_IN_FLIGHT, ranges.length) }, readNext));
		return results;
	}

	#mergeRangeDataSets(orgId: string, rangeDataSets: CalendarRangeData[], read: CalendarRangeRead): void {
		for (const rangeData of rangeDataSets) {
			this.#mergeRangeIntoStores(orgId, rangeData, read);
			this.loadedRange = extendLoadedRange(
				untrack(() => this.loadedRange),
				rangeData
			);
		}
	}
}
