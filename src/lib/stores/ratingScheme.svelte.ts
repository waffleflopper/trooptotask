import type { RatingSchemeEntry } from '../types';

class RatingSchemeStore {
	#entries = $state<RatingSchemeEntry[]>([]);
	#orgId = '';

	get list() {
		return this.#entries;
	}

	load(entries: RatingSchemeEntry[], orgId: string) {
		this.#entries = entries;
		this.#orgId = orgId;
	}

	async add(data: Omit<RatingSchemeEntry, 'id'>): Promise<RatingSchemeEntry | null> {
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: RatingSchemeEntry = { id: tempId, ...data };
		this.#entries = [...this.#entries, optimistic];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add rating scheme entry');
			const created = await res.json();
			this.#entries = this.#entries.map((e) => (e.id === tempId ? created : e));
			return created;
		} catch {
			this.#entries = this.#entries.filter((e) => e.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<RatingSchemeEntry, 'id'>>): Promise<boolean> {
		const original = this.#entries.find((e) => e.id === id);
		if (!original) return false;

		this.#entries = this.#entries.map((e) => (e.id === id ? { ...e, ...data } : e));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update rating scheme entry');
			const updated = await res.json();
			this.#entries = this.#entries.map((e) => (e.id === id ? updated : e));
			return true;
		} catch {
			this.#entries = this.#entries.map((e) => (e.id === id ? original : e));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		const original = this.#entries.find((e) => e.id === id);
		if (!original) return false;

		this.#entries = this.#entries.filter((e) => e.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/rating-scheme`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete rating scheme entry');
			return true;
		} catch {
			this.#entries = [...this.#entries, original];
			return false;
		}
	}
}

export const ratingSchemeStore = new RatingSchemeStore();
