import type { TaskingAttentionProjection } from '$features/calendar';
import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
import type { DashboardTaskingsState } from './contracts';

type Streamed = TaskingAttentionProjection | null | Promise<TaskingAttentionProjection | null> | undefined;
type Outcome = { orgId: string } & (
	| { status: 'ready'; attention: TaskingAttentionProjection }
	| { status: 'off' | 'failed' }
);

/**
 * The Tasking attention read, apart from the rest of the page: a failure shows on its own rows, and a read
 * answers only for the Organization it started in.
 */
export class DashboardTaskingsSource {
	#outcome = $state.raw<Outcome | null>(null);
	#request = 0;

	stateFor(orgId: string): DashboardTaskingsState {
		const outcome = this.#outcome;
		if (outcome?.orgId !== orgId) return { status: 'pending' };
		return outcome.status === 'ready' ? { status: 'ready', attention: outcome.attention } : { status: outcome.status };
	}

	/** Follows the page load's stream; the returned function stops following it. */
	track(streamed: Streamed, orgId: string): () => void {
		const request = ++this.#request;
		if (streamed === undefined) return () => {};
		const settle = (attention: TaskingAttentionProjection | null) => {
			this.#outcome = attention ? { orgId, status: 'ready', attention } : { orgId, status: 'off' };
		};
		if (!isPromiseLike(streamed)) {
			settle(streamed);
			return () => {};
		}
		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load Tasking attention',
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
	async refresh(orgId: string, stillHere: () => boolean): Promise<void> {
		const request = ++this.#request;
		const attention = await this.#fetch(orgId);
		if (request !== this.#request || !stillHere() || attention === 'failed') return;
		this.#outcome = attention ? { orgId, status: 'ready', attention } : { orgId, status: 'off' };
	}

	/** Reads again after a failure, showing the loading rows until the read lands. */
	async retry(orgId: string, stillHere: () => boolean): Promise<void> {
		const request = ++this.#request;
		this.#outcome = null;
		const attention = await this.#fetch(orgId);
		if (request !== this.#request || !stillHere()) return;
		this.#outcome =
			attention === 'failed'
				? { orgId, status: 'failed' }
				: attention
					? { orgId, status: 'ready', attention }
					: { orgId, status: 'off' };
	}

	async #fetch(orgId: string): Promise<TaskingAttentionProjection | null | 'failed'> {
		try {
			const response = await fetch(`/org/${orgId}/api/dashboard/taskings`, { cache: 'no-store' });
			return response.ok ? ((await response.json()) as TaskingAttentionProjection | null) : 'failed';
		} catch {
			return 'failed';
		}
	}
}
