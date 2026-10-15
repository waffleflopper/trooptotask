import { getContext, setContext, tick } from 'svelte';

export interface ReorderEntry {
	id: string;
	label: string;
}

type Drop = { id: string; edge: 'before' | 'after' };

const CONTROLLER = Symbol('reorder-list');
const ITEM = Symbol('reorder-item');

/** Moves entries by drag or arrow keys and says where they went. The consumer owns the order. */
export class ReorderController {
	dragId = $state<string | null>(null);
	drop = $state<Drop | null>(null);
	message = $state('');

	readonly #entries: () => ReorderEntry[];
	readonly #onmove: (id: string, toIndex: number) => unknown;
	readonly #root: () => HTMLElement | null;
	#moves = 0;

	constructor(
		entries: () => ReorderEntry[],
		onmove: (id: string, toIndex: number) => unknown,
		root: () => HTMLElement | null
	) {
		this.#entries = entries;
		this.#onmove = onmove;
		this.#root = root;
	}

	label(id: string): string {
		return this.#entries().find((entry) => entry.id === id)?.label ?? '';
	}

	async move(id: string, toIndex: number): Promise<void> {
		const entries = this.#entries();
		const from = entries.findIndex((entry) => entry.id === id);
		if (from < 0) return;
		const to = Math.max(0, Math.min(toIndex, entries.length - 1));
		const name = entries[from].label;
		if (to === from) {
			this.message = `${name} is already ${from === 0 ? 'first' : 'last'}`;
			return;
		}
		this.message = `${name} moved to position ${to + 1} of ${entries.length}`;
		const move = ++this.#moves;
		const moving = this.#onmove(id, to);
		await tick();
		this.#root()
			?.querySelector<HTMLElement>(`:scope > [data-reorder-id="${CSS.escape(id)}"] [data-reorder-grip]`)
			?.focus();
		await moving;
		if (move !== this.#moves) return;
		// A consumer that could not keep the move shows its saved order; say where the row really is.
		const settled = this.#entries();
		const at = settled.findIndex((entry) => entry.id === id);
		if (at >= 0 && at !== to) this.message = `${name} is now at position ${at + 1} of ${settled.length}`;
	}

	keydown(id: string, event: KeyboardEvent): void {
		if (this.dragId) {
			if (event.key === 'Escape') this.#endDrag();
			return;
		}
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const from = this.#entries().findIndex((entry) => entry.id === id);
		void this.move(id, from + (event.key === 'ArrowUp' ? -1 : 1));
	}

	pointerdown(id: string, event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		const grip = event.currentTarget as HTMLElement;
		grip.focus();
		grip.setPointerCapture?.(event.pointerId);
		this.dragId = id;
	}

	pointermove(event: PointerEvent): void {
		if (!this.dragId) return;
		const rows = this.#rows();
		const from = rows.findIndex((row) => row.dataset.reorderId === this.dragId);
		const insertAt = rows.findIndex((row) => {
			const box = row.getBoundingClientRect();
			return event.clientY < box.top + box.height / 2;
		});
		const before = insertAt < 0 ? rows.length : insertAt;
		const to = before > from ? before - 1 : before;
		this.drop =
			from < 0 || to === from
				? null
				: before < rows.length
					? { id: rows[before].dataset.reorderId!, edge: 'before' }
					: { id: rows[rows.length - 1].dataset.reorderId!, edge: 'after' };
	}

	pointerup(): void {
		const id = this.dragId;
		const drop = this.drop;
		this.#endDrag();
		if (!id || !drop) return;
		const rows = this.#rows().map((row) => row.dataset.reorderId!);
		const from = rows.indexOf(id);
		const target = rows.indexOf(drop.id) + (drop.edge === 'after' ? 1 : 0);
		void this.move(id, target > from ? target - 1 : target);
	}

	cancel(): void {
		this.#endDrag();
	}

	#rows(): HTMLElement[] {
		return [...(this.#root()?.querySelectorAll<HTMLElement>(':scope > [data-reorder-id]') ?? [])];
	}

	#endDrag(): void {
		this.dragId = null;
		this.drop = null;
	}
}

export function setReorderController(controller: ReorderController): void {
	setContext(CONTROLLER, controller);
}

export function getReorderController(): ReorderController {
	return getContext<ReorderController>(CONTROLLER);
}

export function setReorderItemId(id: () => string): void {
	setContext(ITEM, id);
}

export function getReorderItemId(): string {
	return getContext<() => string>(ITEM)();
}
