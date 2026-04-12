import { SvelteMap } from 'svelte/reactivity';

/**
 * ModalRegistry — a shared registry for managing modal visibility and payloads.
 * Replaces scattered boolean $state variables across route pages.
 */
export class ModalRegistry {
	#modals = $state(new SvelteMap<string, unknown>());
	#closers: Record<string, () => void> = Object.create(null);

	isOpen(id: string): boolean {
		return this.#modals.has(id);
	}

	payload<T>(id: string): T | undefined {
		if (!this.#modals.has(id)) return undefined;
		return this.#modals.get(id) as T | undefined;
	}

	open(id: string, payload?: unknown): void {
		this.#modals.set(id, payload);
	}

	close(id: string): void {
		this.#modals.delete(id);
	}

	closeAll(): void {
		this.#modals.clear();
	}

	closerFor(id: string): () => void {
		let cached = this.#closers[id];
		if (!cached) {
			cached = () => this.close(id);
			this.#closers[id] = cached;
		}
		return cached;
	}
}
