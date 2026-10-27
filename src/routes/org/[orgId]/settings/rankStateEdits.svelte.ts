import { SvelteMap } from 'svelte/reactivity';
import type { RankState } from '$features/personnel/contracts';

export type RankStateChange = { code: string; state: RankState };

/** Resolves with the failure message, or null once the change is saved. */
export type SendRankStates = (changes: RankStateChange[]) => Promise<string | null>;

type Shown = { state: RankState; request: number; savedOn: unknown };

const FALLBACK_FAILURE = 'That change did not save. Try again.';

/**
 * Rank on/off changes show at once and save in click order. A saved change keeps showing until the catalog it was
 * saved against is replaced, so the chip never flickers back while the fresh catalog loads. A failed one drops back
 * to the catalog's state unless a later click on the same rank is still on its way.
 */
export class RankStateEdits {
	#shown = new SvelteMap<string, Shown>();
	#queue: Promise<unknown> = Promise.resolve();
	#request = 0;
	#send: SendRankStates;
	#catalog: () => unknown;
	pending = $state(0);

	constructor(send: SendRankStates, catalog: () => unknown) {
		this.#send = send;
		this.#catalog = catalog;
	}

	stateOf(code: string, saved: RankState): RankState {
		const shown = this.#shown.get(code);
		return shown && (shown.savedOn === null || shown.savedOn === this.#catalog()) ? shown.state : saved;
	}

	apply(changes: RankStateChange[]): Promise<string | null> {
		const request = ++this.#request;
		for (const change of changes) this.#shown.set(change.code, { state: change.state, request, savedOn: null });
		this.pending++;
		const sent = this.#queue.then(() => this.#send(changes)).catch(() => FALLBACK_FAILURE);
		this.#queue = sent;
		return sent.then((failure) => {
			const catalog = this.#catalog();
			for (const change of changes) {
				const shown = this.#shown.get(change.code);
				if (shown?.request !== request) continue;
				if (failure) this.#shown.delete(change.code);
				else this.#shown.set(change.code, { ...shown, savedOn: catalog });
			}
			this.pending--;
			return failure;
		});
	}
}
