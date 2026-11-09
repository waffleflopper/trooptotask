import { SvelteURL } from 'svelte/reactivity';

type SearchState = { personSearch?: true };
type Entry = { state: SearchState; shallow: { url: URL } | null };

const START = new URL('http://localhost/');

export const page = $state<{ state: SearchState; url: URL; shallow: { url: URL } | null }>({
	state: {},
	url: START,
	shallow: null
});

let entries: Entry[] = [{ state: {}, shallow: null }];
let index = 0;

export const navigations: Array<{ href: string; replaceState: boolean | undefined }> = [];

function show(entry: Entry): void {
	page.state = entry.state;
	page.shallow = entry.shallow;
}

export function resetHistory(): void {
	entries = [{ state: {}, shallow: null }];
	index = 0;
	page.url = START;
	show(entries[0]);
	navigations.length = 0;
}

export function go(delta: number): void {
	index = Math.max(0, Math.min(entries.length - 1, index + delta));
	show(entries[index]);
}

export function historyLength(): number {
	return entries.length;
}

/**
 * A shallow goto adds or replaces an entry carrying its state, as SvelteKit does. Any other goto replaces the current
 * entry's state with a plain page when it replaces, and otherwise pushes one.
 */
export async function goto(
	href: string,
	options?: { replaceState?: boolean; replace?: boolean; shallow?: boolean; state?: SearchState }
): Promise<void> {
	if (options?.shallow) {
		const entry = { state: options.state ?? {}, shallow: { url: new SvelteURL(href, page.url) } };
		if (options.replace) entries[index] = entry;
		else {
			entries = [...entries.slice(0, index + 1), entry];
			index = entries.length - 1;
		}
		show(entry);
		return;
	}
	navigations.push({ href, replaceState: options?.replaceState });
	const entry = { state: {}, shallow: null };
	if (options?.replaceState) entries[index] = entry;
	else {
		entries = [...entries.slice(0, index + 1), entry];
		index = entries.length - 1;
	}
	show(entry);
}
