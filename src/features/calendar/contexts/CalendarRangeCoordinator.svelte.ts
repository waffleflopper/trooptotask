import type { CalendarBootstrap, CalendarRangeData } from '$features/calendar/calendar.types';
import { untrack } from 'svelte';
import { stillInOrganizationLifetime } from '$lib/stores/core';
import {
	CALENDAR_RANGE_COLLECTIONS,
	extendLoadedRange,
	planCalendarRangeReads,
	type CalendarCoverage,
	type CalendarRangeRequest
} from '$features/calendar/utils/calendarRange';
import {
	EMPTY_PROJECTION,
	replaceProjectionRange,
	type CalendarProjection
} from '$features/calendar/projection/calendarProjection';
import {
	beginCalendarRangeRead,
	loadCalendarRange,
	mergeCalendarRangeIntoStores
} from '$features/calendar/utils/calendarRangeLoader';

type CalendarBootstrapRangeData = Pick<CalendarBootstrap, 'rangeStart' | 'rangeEnd' | 'availabilityRange'>;

interface CalendarRangeCoordinatorDeps {
	loadRange?: typeof loadCalendarRange;
	mergeRangeIntoStores?: typeof mergeCalendarRangeIntoStores;
}

export type CalendarRangeStatus = 'ready' | 'loading' | 'error';

/** The matrix does not wait for Events, so their gaps are not part of the range status. */
function withoutEvents({ events: _events, ...coverage }: CalendarCoverage): CalendarCoverage {
	return coverage;
}

const MAX_READS_IN_FLIGHT = 2;

export class CalendarRangeCoordinator {
	loaded = $state<CalendarCoverage>({});
	loading = $state(false);
	error = $state<Error | null>(null);
	retryToken = $state(0);
	/** Events, suspenses and commitments of the ranges read so far; every read adds to it. */
	projection = $state.raw<CalendarProjection>(EMPTY_PROJECTION);
	/** The last read answered everything but the projection, which the server could not read. */
	projectionFailed = $state(false);

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
		this.loaded = {};
		this.projection = EMPTY_PROJECTION;
		this.projectionFailed = false;
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
		this.#include({
			availability: bootstrap.availabilityRange,
			assignments: { rangeStart: bootstrap.rangeStart, rangeEnd: bootstrap.rangeEnd }
		});
	}

	applyToBootstrap<TBootstrap extends CalendarBootstrapRangeData>(bootstrap: TBootstrap): TBootstrap {
		const { availability, assignments } = this.loaded;
		return {
			...bootstrap,
			rangeStart: assignments?.rangeStart ?? bootstrap.rangeStart,
			rangeEnd: assignments?.rangeEnd ?? bootstrap.rangeEnd,
			availabilityRange: availability ?? bootstrap.availabilityRange
		};
	}

	retryFailedRange(): void {
		this.error = null;
		this.projectionFailed = false;
		this.#failedRangeKey = null;
		this.retryToken += 1;
	}

	status(needed: CalendarCoverage): CalendarRangeStatus {
		if (planCalendarRangeReads(this.loaded, withoutEvents(needed)).length === 0) return 'ready';
		return this.error ? 'error' : 'loading';
	}

	/** The Events region alone: a failed projection read leaves `status` ready and the matrix usable. */
	projectionStatus(needed: CalendarCoverage): CalendarRangeStatus {
		if (!needed.events || planCalendarRangeReads(this.loaded, { events: needed.events }).length === 0) return 'ready';
		return this.error || this.projectionFailed ? 'error' : 'loading';
	}

	/** Reads whatever part of `needed` is not loaded yet. Callers check view capability first. */
	async ensureRange(orgId: string, needed: CalendarCoverage): Promise<void> {
		const nextRanges = planCalendarRangeReads(
			untrack(() => this.loaded),
			needed
		);

		if (nextRanges.length === 0) {
			// A late disjoint reply would replace coverage this range relies on.
			this.cancelInFlightLoads();
			this.#failedRangeKey = null;
			this.error = null;
			return;
		}

		const requestKey = nextRanges
			.map((read) => `${read.rangeStart}:${read.rangeEnd}:${read.collections.join(',')}`)
			.join('|');
		const pendingRangeKey = untrack(() => this.#pendingRangeKey);
		const failedRangeKey = untrack(() => this.#failedRangeKey);
		if (pendingRangeKey === requestKey || failedRangeKey === requestKey) {
			return;
		}

		this.loading = true;
		this.error = null;
		if (nextRanges.some((read) => read.collections.includes('events'))) this.projectionFailed = false;
		this.#pendingRangeKey = requestKey;
		const requestSerial = ++this.#requestSerial;
		const read = beginCalendarRangeRead();

		try {
			const rangeDataSets = await this.#readRanges(orgId, nextRanges, requestSerial);
			if (requestSerial !== this.#requestSerial) {
				return;
			}

			for (const rangeData of rangeDataSets) this.#mergeRangeIntoStores(orgId, rangeData, read);
			const projections = rangeDataSets.flatMap((rangeData) => rangeData.projection ?? []);
			this.projectionFailed = projections.some((read) => read.kind === 'failed');
			if (!this.projectionFailed) {
				for (const rangeData of rangeDataSets) {
					if (rangeData.projection?.kind === 'loaded') {
						this.projection = replaceProjectionRange(this.projection, rangeData, rangeData.projection);
					}
				}
			}
			this.#include(this.projectionFailed ? withoutEvents(needed) : needed);
			this.loading = false;
			// A refused projection waits for a Retry rather than reading again on every pass.
			this.#failedRangeKey = this.projectionFailed ? requestKey : null;
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

	/**
	 * Reads the assignments of `needed` again, loaded or not, after a write the server refused because another
	 * operator changed them. Coverage and the shown status stay as they are. Nothing is applied when the user has
	 * left the Organization or the page has left the range meanwhile; a failed read leaves the stores as they were.
	 */
	async rereadAssignments(orgId: string, needed: CalendarCoverage): Promise<'read' | 'failed' | 'abandoned'> {
		if (!needed.assignments) return 'read';
		const requestSerial = this.#requestSerial;
		const sameOrganization = stillInOrganizationLifetime();
		const read = beginCalendarRangeRead();
		try {
			const reads = planCalendarRangeReads({}, { assignments: needed.assignments });
			const rangeDataSets = await this.#readRanges(orgId, reads, requestSerial);
			if (!sameOrganization() || requestSerial !== this.#requestSerial) return 'abandoned';
			for (const rangeData of rangeDataSets) this.#mergeRangeIntoStores(orgId, rangeData, read);
			return 'read';
		} catch {
			return sameOrganization() && requestSerial === this.#requestSerial ? 'failed' : 'abandoned';
		} finally {
			read.close();
		}
	}

	#include(read: CalendarCoverage): void {
		const loaded = { ...untrack(() => this.loaded) };
		for (const collection of CALENDAR_RANGE_COLLECTIONS) {
			const range = read[collection];
			if (range) loaded[collection] = extendLoadedRange(loaded[collection] ?? null, range);
		}
		this.loaded = loaded;
	}

	async #readRanges(
		orgId: string,
		ranges: CalendarRangeRequest[],
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
}
