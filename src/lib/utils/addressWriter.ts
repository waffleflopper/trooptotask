import { goto } from '$app/navigation';
import { page } from '$app/state';
import { visibleUrl } from './visibleUrl';

type PageState = typeof page.state;

export interface AddressWrite {
	/** Edits a copy of the address bar's URL, for example to set or delete a search param. */
	url?: (url: URL) => void;
	/** Defaults to the current `page.state`, so an open drawer or Help keeps its history. */
	state?: PageState;
	/** Adds a history entry, so Back undoes the write. Otherwise the write replaces the current entry. */
	push?: boolean;
}

/**
 * Changes the address bar and `page.state` without loading anything, and leaves scroll and focus alone. It is a shallow
 * `goto`, so navigation hooks see it with `navigation.shallow` set, and it supersedes an `invalidate()` that is still
 * loading: await the write before invalidating. A replace that changes neither the URL nor the state does nothing.
 */
export function writeAddress({ url: edit, state = page.state, push = false }: AddressWrite = {}): Promise<void> {
	const shown = visibleUrl();
	const url = new URL(shown.href);
	edit?.(url);
	if (!push && state === page.state && url.href === shown.href) return Promise.resolve();
	return goto(`${url.pathname}${url.search}${url.hash}`, { shallow: true, replace: !push, state });
}

/**
 * Writes one at a time and keeps only the latest write still waiting, so fast typing lands in order and does not pile
 * up history writes. A run stops once the reader has left the page it started on, and a failed write drops the rest.
 */
export class LatestAddressWriter {
	#next: AddressWrite | null = null;
	#run: Promise<void> | null = null;

	/** Whether a write is still landing, so the address may not show the latest one yet. */
	get writing(): boolean {
		return this.#run !== null;
	}

	write(change: AddressWrite): Promise<void> {
		this.#next = change;
		this.#run ??= this.#drain();
		return this.#run;
	}

	async #drain(): Promise<void> {
		const { pathname } = visibleUrl();
		try {
			while (this.#next && visibleUrl().pathname === pathname) {
				const change = this.#next;
				this.#next = null;
				await writeAddress(change);
			}
		} finally {
			this.#next = null;
			this.#run = null;
		}
	}
}
