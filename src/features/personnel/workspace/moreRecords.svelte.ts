export interface MoreRecordsDeps {
	/** Endpoint that lists the next page from `?offset=`. */
	endpoint: () => string;
	/** The records the page already shows, in list order. */
	shown: () => readonly { id: string }[];
	fetch: typeof fetch;
	failureMessage: string;
}

/**
 * Pages older records in after the first read. The owning view is keyed on the read it came from,
 * so a refresh discards what was paged in instead of splicing it into shifted rows.
 */
export class MoreRecords<T extends { id: string }> {
	records = $state<T[]>([]);
	loading = $state(false);
	error = $state('');
	readonly #deps: MoreRecordsDeps;
	#live = true;

	constructor(deps: MoreRecordsDeps) {
		this.#deps = deps;
		$effect(() => () => {
			this.#live = false;
		});
	}

	load = async (): Promise<void> => {
		if (this.loading) return;
		this.loading = true;
		this.error = '';
		try {
			const offset = this.#deps.shown().length + this.records.length;
			const response = await this.#deps.fetch(`${this.#deps.endpoint()}?offset=${offset}`);
			if (!response.ok) throw new Error(this.#deps.failureMessage);
			const page = (await response.json()) as T[];
			if (this.#live) {
				const held = [...this.#deps.shown(), ...this.records];
				this.records = [...this.records, ...page.filter((record) => !held.some((kept) => kept.id === record.id))];
			}
		} catch {
			if (this.#live) this.error = this.#deps.failureMessage;
		} finally {
			if (this.#live) this.loading = false;
		}
	};
}
