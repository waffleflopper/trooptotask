import type { TrainingType } from '../types';

class TrainingTypesStore {
	#trainingTypes = $state<TrainingType[]>([]);
	#orgId = '';

	get list() {
		return [...this.#trainingTypes].sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(trainingTypes: TrainingType[], orgId: string) {
		this.#trainingTypes = trainingTypes;
		this.#orgId = orgId;
	}

	async add(data: Omit<TrainingType, 'id'>): Promise<TrainingType | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticType: TrainingType = { id: tempId, ...data };
		this.#trainingTypes = [...this.#trainingTypes, optimisticType];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/training-types`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add training type');
			const newType = await res.json();
			// Replace temp with real data
			this.#trainingTypes = this.#trainingTypes.map((t) => (t.id === tempId ? newType : t));
			return newType;
		} catch {
			// Rollback on failure
			this.#trainingTypes = this.#trainingTypes.filter((t) => t.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<TrainingType, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#trainingTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#trainingTypes = this.#trainingTypes.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/training-types`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update training type');
			const updated = await res.json();
			// Replace with server response
			this.#trainingTypes = this.#trainingTypes.map((t) => (t.id === id ? updated : t));
			return true;
		} catch {
			// Rollback on failure
			this.#trainingTypes = this.#trainingTypes.map((t) => (t.id === id ? original : t));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#trainingTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#trainingTypes = this.#trainingTypes.filter((t) => t.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/training-types`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete training type');
			return true;
		} catch {
			// Rollback on failure
			this.#trainingTypes = [...this.#trainingTypes, original];
			return false;
		}
	}

	getById(id: string) {
		return this.#trainingTypes.find((t) => t.id === id);
	}
}

export const trainingTypesStore = new TrainingTypesStore();
