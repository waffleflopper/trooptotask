import { SvelteURL } from 'svelte/reactivity';
import { vi } from 'vitest';

type Entry = { state: App.PageState; shallow: { url: URL } | null };

const START = new URL('http://localhost/org/org1/calendar');

/** Stands in for `$app/state`'s `page`. Reactive, so a mounted component follows the history entry that is current. */
export const page = $state<{ state: App.PageState; url: URL; shallow: { url: URL } | null }>({
	state: {},
	url: START,
	shallow: null
});

let entries: Entry[] = [{ state: {}, shallow: null }];
let index = 0;

function show(entry: Entry): void {
	page.state = entry.state;
	page.shallow = entry.shallow;
}

/** Steps through the entries as the browser's Back and Forward do. */
export function go(delta: number): void {
	index = Math.max(0, Math.min(entries.length - 1, index + delta));
	show(entries[index]);
}

export function historyLength(): number {
	return entries.length;
}

/** The current entry's place in the history, counted from the first. */
export function position(): number {
	return index;
}

/** A shallow `goto` adds or replaces an entry carrying its state, as SvelteKit does. */
export async function goto(
	href: string,
	options?: { shallow?: boolean; replace?: boolean; state?: App.PageState }
): Promise<void> {
	if (!options?.shallow) throw new Error('only shallow writes are expected');
	const entry = { state: options.state ?? {}, shallow: { url: new SvelteURL(href, page.url) } };
	if (options.replace) entries[index] = entry;
	else {
		entries = [...entries.slice(0, index + 1), entry];
		index = entries.length - 1;
	}
	show(entry);
}

/** Starts from one plain entry and routes `history.back()` and `history.go()` through the fake. */
export function resetHistory(): void {
	entries = [{ state: {}, shallow: null }];
	index = 0;
	page.url = START;
	show(entries[0]);
	vi.stubGlobal('history', { back: () => go(-1), go });
}
