import { SvelteURL } from 'svelte/reactivity';

type HistoryState = { importStep?: 'columns' | 'review' | 'done' };

export const page = $state<{ state: HistoryState; url: URL; shallow: { url: URL } | null }>({
	state: {},
	url: new SvelteURL('http://localhost/org/a/personnel/import'),
	shallow: null
});

let entries: HistoryState[] = [{}];
let index = 0;

export function resetHistory(): void {
	entries = [{}];
	index = 0;
	page.state = {};
	page.shallow = null;
}

/** A shallow goto adds or replaces a history entry that carries its state; any other goto leaves the page alone. */
export async function goto(
	href: string,
	options?: { shallow?: boolean; replace?: boolean; state?: HistoryState }
): Promise<void> {
	if (!options?.shallow) return;
	const state = options.state ?? {};
	if (options.replace) entries[index] = state;
	else {
		entries = [...entries.slice(0, index + 1), state];
		index = entries.length - 1;
	}
	page.state = state;
	page.shallow = { url: new SvelteURL(href, page.url) };
}

export function go(delta: number): void {
	index = Math.max(0, Math.min(entries.length - 1, index + delta));
	page.state = entries[index];
}

export function historyEntry(): HistoryState {
	return entries[index];
}

/** SvelteKit's invalidate() resets page.state and leaves history where it is. */
export function invalidate(): void {
	page.state = {};
}
