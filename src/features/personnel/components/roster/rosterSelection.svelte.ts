import { SvelteSet } from 'svelte/reactivity';

export type CheckState = 'none' | 'some' | 'all';

/**
 * The People picked for a bulk action, by id. Ids outlive search, filters, paging and collapsed Groups, so a
 * selection can include people the roster is not showing.
 */
export class RosterSelection {
	readonly #ids = new SvelteSet<string>();
	#anchor: string | null = null;

	has(id: string): boolean {
		return this.#ids.has(id);
	}

	get size(): number {
		return this.#ids.size;
	}

	/**
	 * Sets one person. With `rangeOrder`, also sets everyone between the last person set and this one, in that
	 * order, the way Shift-click works in a list.
	 */
	set(id: string, selected: boolean, rangeOrder?: readonly string[]): void {
		const from = this.#anchor && rangeOrder ? rangeOrder.indexOf(this.#anchor) : -1;
		const to = rangeOrder?.indexOf(id) ?? -1;
		const range =
			rangeOrder && from >= 0 && to >= 0 ? rangeOrder.slice(Math.min(from, to), Math.max(from, to) + 1) : [id];
		for (const each of range) this.#write(each, selected);
		this.#anchor = id;
	}

	toggle(id: string): void {
		this.set(id, !this.#ids.has(id));
	}

	/** How much of `ids` is selected, for a header checkbox over them. */
	state(ids: readonly string[]): CheckState {
		const selected = ids.filter((id) => this.#ids.has(id)).length;
		if (selected === 0) return 'none';
		return selected === ids.length ? 'all' : 'some';
	}

	setAll(ids: readonly string[], selected: boolean): void {
		for (const id of ids) this.#write(id, selected);
	}

	remove(ids: Iterable<string>): void {
		for (const id of ids) this.#ids.delete(id);
	}

	clear(): void {
		this.#ids.clear();
		this.#anchor = null;
	}

	#write(id: string, selected: boolean): void {
		if (selected) this.#ids.add(id);
		else this.#ids.delete(id);
	}
}
