import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
import type { DashboardTaskings, DashboardTaskingsState } from './contracts';

type Streamed = DashboardTaskings | null | Promise<DashboardTaskings | null> | undefined;
type Outcome = { orgId: string } & ({ status: 'ready'; taskings: DashboardTaskings } | { status: 'off' | 'failed' });

/**
 * The Tasking read behind the Needs you rows and the forecast lane, apart from the rest of the page: a failure shows
 * on its own rows, and a read answers only for the Organization it started in.
 */
export class DashboardTaskingsSource {
	#outcome = $state.raw<Outcome | null>(null);
	#request = 0;

	stateFor(orgId: string): DashboardTaskingsState {
		const outcome = this.#outcome;
		if (outcome?.orgId !== orgId) return { status: 'pending' };
		return outcome.status === 'ready' ? { status: 'ready', ...outcome.taskings } : { status: outcome.status };
	}

	/** Follows the page load's stream; the returned function stops following it. */
	track(streamed: Streamed, orgId: string): () => void {
		const request = ++this.#request;
		if (streamed === undefined) return () => {};
		const settle = (taskings: DashboardTaskings | null) => {
			this.#outcome = taskings ? { orgId, status: 'ready', taskings } : { orgId, status: 'off' };
		};
		if (!isPromiseLike(streamed)) {
			settle(streamed);
			return () => {};
		}
		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load Taskings',
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
		const taskings = await this.#fetch(orgId, asOf);
		if (request !== this.#request || !stillHere() || taskings === 'failed') return;
		this.#outcome = taskings ? { orgId, status: 'ready', taskings } : { orgId, status: 'off' };
	}

	/** Reads again after a failure, showing the loading rows until the read lands. */
	async retry(orgId: string, asOf: string, stillHere: () => boolean): Promise<void> {
		const request = ++this.#request;
		this.#outcome = null;
		const taskings = await this.#fetch(orgId, asOf);
		if (request !== this.#request || !stillHere()) return;
		this.#outcome =
			taskings === 'failed'
				? { orgId, status: 'failed' }
				: taskings
					? { orgId, status: 'ready', taskings }
					: { orgId, status: 'off' };
	}

	async #fetch(orgId: string, asOf: string): Promise<DashboardTaskings | null | 'failed'> {
		try {
			const response = await fetch(`/org/${orgId}/api/dashboard/taskings?asOf=${asOf}`, { cache: 'no-store' });
			return response.ok ? ((await response.json()) as DashboardTaskings | null) : 'failed';
		} catch {
			return 'failed';
		}
	}
}
