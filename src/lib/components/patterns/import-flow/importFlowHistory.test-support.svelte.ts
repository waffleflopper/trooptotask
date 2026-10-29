type HistoryState = { importStep?: 'columns' | 'review' | 'done' };

export const page = $state<{ state: HistoryState }>({ state: {} });

let entries: HistoryState[] = [{}];
let index = 0;

export function resetHistory(): void {
	entries = [{}];
	index = 0;
	page.state = {};
}

export function pushState(_url: string, state: HistoryState): void {
	entries = [...entries.slice(0, index + 1), state];
	index = entries.length - 1;
	page.state = state;
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
