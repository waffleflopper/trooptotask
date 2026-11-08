type SearchState = { personSearch?: true };

export const page = $state<{ state: SearchState }>({ state: {} });

let entries: SearchState[] = [{}];
let index = 0;

export const navigations: Array<{ href: string; replaceState: boolean | undefined }> = [];

export function resetHistory(): void {
	entries = [{}];
	index = 0;
	page.state = {};
	navigations.length = 0;
}

export function pushState(_url: string, state: SearchState): void {
	entries = [...entries.slice(0, index + 1), state];
	index = entries.length - 1;
	page.state = state;
}

export function go(delta: number): void {
	index = Math.max(0, Math.min(entries.length - 1, index + delta));
	page.state = entries[index];
}

export function historyLength(): number {
	return entries.length;
}

/** A SvelteKit goto that replaces the current entry swaps its state for a plain page; otherwise it pushes one. */
export async function goto(href: string, options?: { replaceState?: boolean }): Promise<void> {
	navigations.push({ href, replaceState: options?.replaceState });
	if (options?.replaceState) entries[index] = {};
	else entries = [...entries.slice(0, index + 1), {}];
	if (!options?.replaceState) index = entries.length - 1;
	page.state = {};
}
