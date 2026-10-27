import { SvelteMap } from 'svelte/reactivity';
import type { RankState } from '$features/personnel/contracts';
import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';

export type RankStateChange = { code: string; state: RankState };

/** Resolves with the failure message, or null once the change is saved. */
export type SendRankStates = () => Promise<string | null>;

type Confirmed = { state: RankState; savedOn: unknown };
type Shown = Confirmed & { request: number };

const FALLBACK_FAILURE = 'That change did not save. Try again.';

/** Rank edits save in click order and stay visible until their refreshed catalog arrives. */
export class RankStateEdits {
	#shown = new SvelteMap<string, Shown>();
	#confirmed = new SvelteMap<string, Confirmed>();
	#queue: Promise<unknown> = Promise.resolve();
	#request = 0;
	#catalog: () => unknown;
	#disposed = false;
	pending = $state(0);

	constructor(catalog: () => unknown) {
		this.#catalog = catalog;
	}

	get current(): boolean {
		return !this.#disposed;
	}

	dispose(): void {
		this.#disposed = true;
	}

	confirmedStateOf(code: string, saved: RankState): RankState {
		const confirmed = this.#confirmed.get(code);
		return confirmed && confirmed.savedOn === this.#catalog() ? confirmed.state : saved;
	}

	stateOf(code: string, saved: RankState): RankState {
		const shown = this.#shown.get(code);
		return shown && (shown.savedOn === null || shown.savedOn === this.#catalog())
			? shown.state
			: this.confirmedStateOf(code, saved);
	}

	apply(changes: RankStateChange[], send: SendRankStates): Promise<string | null> {
		const inOrganization = stillInOrganizationLifetime();
		const current = () => this.current && inOrganization();
		const request = ++this.#request;
		for (const change of changes) this.#shown.set(change.code, { state: change.state, request, savedOn: null });
		this.pending++;
		const sent = this.#queue.then(() => (current() ? send() : null)).catch(() => FALLBACK_FAILURE);
		this.#queue = sent;
		return withinOrganizationLifetime(
			sent.then((failure) => {
				if (!current()) return null;
				const catalog = this.#catalog();
				for (const change of changes) {
					if (!failure) this.#confirmed.set(change.code, { state: change.state, savedOn: catalog });
					const shown = this.#shown.get(change.code);
					if (shown?.request !== request) continue;
					if (failure) this.#shown.delete(change.code);
					else this.#shown.set(change.code, { ...shown, savedOn: catalog });
				}
				this.pending--;
				return failure;
			}),
			current
		);
	}
}
