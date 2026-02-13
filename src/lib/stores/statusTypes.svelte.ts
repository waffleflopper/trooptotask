import type { StatusType } from '../types';

class StatusTypesStore {
	#statusTypes = $state<StatusType[]>([]);
	#orgId = '';

	get list() {
		return this.#statusTypes;
	}

	load(statusTypes: StatusType[], orgId: string) {
		this.#statusTypes = statusTypes;
		this.#orgId = orgId;
	}

	async add(data: Omit<StatusType, 'id'>): Promise<StatusType | null> {
		const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newType = await res.json();
		this.#statusTypes = [...this.#statusTypes, newType];
		return newType;
	}

	async update(id: string, data: Partial<Omit<StatusType, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#statusTypes = this.#statusTypes.map((t) => (t.id === id ? updated : t));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/status-types`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#statusTypes = this.#statusTypes.filter((t) => t.id !== id);
		return true;
	}

	getById(id: string) {
		return this.#statusTypes.find((t) => t.id === id);
	}
}

export const statusTypesStore = new StatusTypesStore();
