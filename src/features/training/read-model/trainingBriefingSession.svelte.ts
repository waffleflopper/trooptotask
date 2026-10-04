import {
	DEFAULT_BRIEFING_DETAIL_PAGE_SIZE,
	serializeTrainingBriefingDetailInput,
	serializeTrainingBriefingReportInput,
	type BriefingScope,
	type TrainingBriefingDetail,
	type TrainingBriefingReportData,
	type TrainingBriefingReportInput
} from '../contracts';

/** The briefing on screen always belongs to `report.input`; a request in flight or failed names the input it tried. */
export type BriefingRequestState =
	| { status: 'ready' }
	| { status: 'loading'; input: TrainingBriefingReportInput }
	| { status: 'error'; input: TrainingBriefingReportInput; message: string };

export type BriefingDetailState =
	| { status: 'idle' }
	| { status: 'loading'; scope: BriefingScope }
	| { status: 'loaded'; scope: BriefingScope; detail: TrainingBriefingDetail }
	| { status: 'error'; scope: BriefingScope; message: string };

export interface TrainingBriefingSessionOptions {
	orgId: string;
	initialReport: TrainingBriefingReportData;
	fetch: typeof fetch;
	/** Mirrors the canonical query string into the address bar without navigating. */
	replaceQuery: (query: string) => void;
}

function queryFor(input: TrainingBriefingReportInput): string {
	return serializeTrainingBriefingReportInput(input).toString();
}

/** Filter, refetch and drill-down lifecycle for one Organization's Training Reports page. */
export class TrainingBriefingSession {
	report = $state.raw<TrainingBriefingReportData>() as TrainingBriefingReportData;
	selected = $state.raw<TrainingBriefingReportInput>() as TrainingBriefingReportInput;
	request = $state.raw<BriefingRequestState>({ status: 'ready' });
	detail = $state.raw<BriefingDetailState>({ status: 'idle' });

	readonly #options: TrainingBriefingSessionOptions;
	#reportRequest = { id: 0, controller: null as AbortController | null };
	#detailRequest = { id: 0, controller: null as AbortController | null };

	constructor(options: TrainingBriefingSessionOptions) {
		this.#options = options;
		this.#show(options.initialReport, false);
	}

	get apiBase(): string {
		return `/org/${this.#options.orgId}/api/training-reports`;
	}

	get exportHref(): string {
		const query = queryFor(this.report.input);
		return `${this.apiBase}/export${query ? `?${query}` : ''}`;
	}

	select(next: TrainingBriefingReportInput): void {
		const query = queryFor(next);
		this.#cancel(this.#reportRequest);
		if (query === queryFor(this.report.input)) {
			this.#show(this.report);
			return;
		}

		this.selected = next;
		this.request = { status: 'loading', input: next };
		const id = ++this.#reportRequest.id;
		const controller = new AbortController();
		this.#reportRequest.controller = controller;
		const current = () => id === this.#reportRequest.id;

		void this.#options
			.fetch(`${this.apiBase}${query ? `?${query}` : ''}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(`The briefing could not be updated (${response.status}).`);
				return (await response.json()) as TrainingBriefingReportData;
			})
			.then(
				(report) => {
					if (current()) this.#show(report);
				},
				(error: unknown) => {
					if (!current()) return;
					this.selected = this.report.input;
					this.request = {
						status: 'error',
						input: next,
						message: error instanceof Error ? error.message : 'The briefing could not be updated.'
					};
				}
			);
	}

	retry(): void {
		if (this.request.status === 'error') this.select(this.request.input);
	}

	requestDetail(scope: BriefingScope): void {
		this.#cancel(this.#detailRequest);
		this.detail = { status: 'loading', scope };
		const id = ++this.#detailRequest.id;
		const controller = new AbortController();
		this.#detailRequest.controller = controller;
		const current = () => id === this.#detailRequest.id;
		const query = serializeTrainingBriefingDetailInput({
			report: this.report.input,
			scope,
			page: 1,
			pageSize: DEFAULT_BRIEFING_DETAIL_PAGE_SIZE
		}).toString();

		void this.#options
			.fetch(`${this.apiBase}/detail?${query}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) throw new Error(`The affected soldiers could not be loaded (${response.status}).`);
				return (await response.json()) as TrainingBriefingDetail;
			})
			.then(
				(detail) => {
					if (current()) this.detail = { status: 'loaded', scope, detail };
				},
				(error: unknown) => {
					if (!current()) return;
					this.detail = {
						status: 'error',
						scope,
						message: error instanceof Error ? error.message : 'The affected soldiers could not be loaded.'
					};
				}
			);
	}

	retryDetail(): void {
		if (this.detail.status === 'error') this.requestDetail(this.detail.scope);
	}

	/** Abandons every request so no late response can write into a page that has gone away. */
	dispose(): void {
		this.#cancel(this.#reportRequest);
		this.#cancel(this.#detailRequest);
	}

	/** Puts the canonical query of the briefing on screen into the address bar. */
	syncQuery(): void {
		this.#options.replaceQuery(queryFor(this.report.input));
	}

	#show(report: TrainingBriefingReportData, sync = true): void {
		const changed = this.report?.input !== report.input;
		this.report = report;
		this.selected = report.input;
		this.request = { status: 'ready' };
		if (changed) {
			this.#cancel(this.#detailRequest);
			this.detail = { status: 'idle' };
		}
		if (sync) this.syncQuery();
	}

	#cancel(request: { id: number; controller: AbortController | null }): void {
		request.id += 1;
		request.controller?.abort();
		request.controller = null;
	}
}
