import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';

type Streamed<T> = T | null | Promise<T | null> | undefined;
type Outcome<T> = { orgId: string } & ({ status: 'ready'; value: T } | { status: 'off' | 'failed' });
export type DashboardSourceState<T extends object> =
	| { status: 'off' | 'pending' | 'failed' }
	| ({ status: 'ready' } & T);

/**
 * A read behind part of the Dashboard, apart from the rest of the page: a failure shows on its own rows, and a read
 * answers only for the Organization it started in. A null answer means the source is not read for this viewer or unit.
 */
export class DashboardSource<T extends object> {
	#outcome = $state.raw<Outcome<T> | null>(null);
	#request = 0;
	readonly #url: (orgId: string, asOf: string) => string;
	readonly #failureMessage: string;

	constructor(url: (orgId: string, asOf: string) => string, failureMessage: string) {
		this.#url = url;
		this.#failureMessage = failureMessage;
	}

	stateFor(orgId: string): DashboardSourceState<T> {
		const outcome = this.#outcome;
		if (outcome?.orgId !== orgId) return { status: 'pending' };
		return outcome.status === 'ready' ? { status: 'ready', ...outcome.value } : { status: outcome.status };
	}

	/** Follows the page load's stream; the returned function stops following it. */
	track(streamed: Streamed<T>, orgId: string): () => void {
		const request = ++this.#request;
		if (streamed === undefined) return () => {};
		const settle = (value: T | null) => {
			this.#outcome = value ? { orgId, status: 'ready', value } : { orgId, status: 'off' };
		};
		if (!isPromiseLike(streamed)) {
			settle(streamed);
			return () => {};
		}
		void observeDeferred(streamed, {
			fallbackMessage: this.#failureMessage,
			onResolve: settle,
			onReject: () => {
				if (this.#outcome?.orgId !== orgId) this.#outcome = { orgId, status: 'failed' };
			},
			isCancelled: () => request !== this.#request
		});
		return () => {
			this.#request++;
		};
	}

	/** Rereads after a save: the rows stay as they were until the read lands, and stay if it fails. */
	async refresh(orgId: string, asOf: string, stillHere: () => boolean): Promise<void> {
		const request = ++this.#request;
		const value = await this.#fetch(orgId, asOf);
		if (request !== this.#request || !stillHere() || value === 'failed') return;
		this.#outcome = value ? { orgId, status: 'ready', value } : { orgId, status: 'off' };
	}

	/** Reads again after a failure, showing the loading rows until the read lands. */
	async retry(orgId: string, asOf: string, stillHere: () => boolean): Promise<void> {
		const request = ++this.#request;
		this.#outcome = null;
		const value = await this.#fetch(orgId, asOf);
		if (request !== this.#request || !stillHere()) return;
		this.#outcome =
			value === 'failed'
				? { orgId, status: 'failed' }
				: value
					? { orgId, status: 'ready', value }
					: { orgId, status: 'off' };
	}

	async #fetch(orgId: string, asOf: string): Promise<T | null | 'failed'> {
		try {
			const response = await fetch(this.#url(orgId, asOf), { cache: 'no-store' });
			return response.ok ? ((await response.json()) as T | null) : 'failed';
		} catch {
			return 'failed';
		}
	}
}
