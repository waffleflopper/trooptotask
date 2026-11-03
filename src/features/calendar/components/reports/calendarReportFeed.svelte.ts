import { fetchCalendarReportData, type CalendarReportData } from './calendarReportData';
import type { ReportRange } from './reportQuery';

/** `key` names the range a state belongs to, so a view never shows data for another span. */
export type CalendarReportFeedState =
	| { status: 'idle' }
	| { status: 'loading'; key: string }
	| { status: 'ready'; key: string; data: CalendarReportData }
	| { status: 'error'; key: string; message: string };

type FetchData = (orgId: string, start: string, end: string, signal: AbortSignal) => Promise<CalendarReportData>;

/** The `key` a feed state carries for `range`. */
export function reportFeedKey(range: ReportRange): string {
	return `${range.start}|${range.end}`;
}

/**
 * One Organization's calendar data for the span on screen. Asking for the span already loading or loaded does nothing,
 * a new span cancels the one in flight, and a response that is no longer current never reaches `state`.
 */
export class CalendarReportFeed {
	state = $state.raw<CalendarReportFeedState>({ status: 'idle' });

	readonly #orgId: string;
	readonly #fetchData: FetchData;
	#range: ReportRange | null = null;
	#controller: AbortController | null = null;
	#generation = 0;

	constructor(orgId: string, fetchData: FetchData = fetchCalendarReportData) {
		this.#orgId = orgId;
		this.#fetchData = fetchData;
	}

	load(range: ReportRange): void {
		const key = reportFeedKey(range);
		if (this.state.status !== 'idle' && this.state.status !== 'error' && this.state.key === key) return;
		this.#start(range, key);
	}

	retry(): void {
		if (this.#range) this.#start(this.#range, reportFeedKey(this.#range));
	}

	dispose(): void {
		this.#generation++;
		this.#controller?.abort();
		this.#controller = null;
	}

	#start(range: ReportRange, key: string): void {
		this.#controller?.abort();
		const controller = new AbortController();
		this.#controller = controller;
		this.#range = range;
		const generation = ++this.#generation;
		this.state = { status: 'loading', key };
		this.#fetchData(this.#orgId, range.start, range.end, controller.signal).then(
			(data) => {
				if (generation === this.#generation) this.state = { status: 'ready', key, data };
			},
			(cause: unknown) => {
				if (generation !== this.#generation) return;
				this.state = {
					status: 'error',
					key,
					message: cause instanceof Error ? cause.message : 'The calendar data could not be loaded.'
				};
			}
		);
	}
}
