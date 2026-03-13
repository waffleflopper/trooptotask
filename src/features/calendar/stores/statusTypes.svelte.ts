import type { StatusType } from '../calendar.types';

class StatusTypesStore {
	#statusTypes = $state.raw<StatusType[]>([]);
	#orgId = '';

	get list() {
		return this.#statusTypes;
	}

	load(statusTypes: StatusType[], orgId: string) {
		this.#statusTypes = statusTypes;
		this.#orgId = orgId;
	}

	async add(data: Omit<StatusType, 'id'>): Promise<StatusType | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticType: StatusType = { id: tempId, ...data };
		this.#statusTypes = [...this.#statusTypes, optimisticType];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add status type');
			const newType = await res.json();
			// Replace temp with real data
			this.#statusTypes = this.#statusTypes.map((t) => (t.id === tempId ? newType : t));
			return newType;
		} catch {
			// Rollback on failure
			this.#statusTypes = this.#statusTypes.filter((t) => t.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<StatusType, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#statusTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#statusTypes = this.#statusTypes.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update status type');
			const updated = await res.json();
			// Replace with server response
			this.#statusTypes = this.#statusTypes.map((t) => (t.id === id ? updated : t));
			return true;
		} catch {
			// Rollback on failure
			this.#statusTypes = this.#statusTypes.map((t) => (t.id === id ? original : t));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#statusTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#statusTypes = this.#statusTypes.filter((t) => t.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete status type');
			return true;
		} catch {
			// Rollback on failure
			this.#statusTypes = [...this.#statusTypes, original];
			return false;
		}
	}

	getById(id: string) {
		return this.#statusTypes.find((t) => t.id === id);
	}
}

export const statusTypesStore = new StatusTypesStore();
