import type { PersonnelTraining } from '../types';

class PersonnelTrainingsStore {
	#trainings = $state<PersonnelTraining[]>([]);
	#orgId = '';

	get list() {
		return this.#trainings;
	}

	load(trainings: PersonnelTraining[], orgId: string) {
		this.#trainings = trainings;
		this.#orgId = orgId;
	}

	async add(data: Omit<PersonnelTraining, 'id'>): Promise<PersonnelTraining | null> {
		// Store existing entry for rollback (upsert replaces existing)
		const existingEntry = this.#trainings.find(
			(t) => t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId
		);

		// Optimistic: add with temp ID (upsert removes existing first)
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticTraining: PersonnelTraining = { id: tempId, ...data };
		this.#trainings = this.#trainings.filter(
			(t) => !(t.personnelId === data.personnelId && t.trainingTypeId === data.trainingTypeId)
		);
		this.#trainings = [...this.#trainings, optimisticTraining];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add personnel training');
			const newTraining = await res.json();
			// Replace temp with real data
			this.#trainings = this.#trainings.map((t) => (t.id === tempId ? newTraining : t));
			return newTraining;
		} catch {
			// Rollback on failure
			this.#trainings = this.#trainings.filter((t) => t.id !== tempId);
			if (existingEntry) {
				this.#trainings = [...this.#trainings, existingEntry];
			}
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<PersonnelTraining, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#trainings.find((t) => t.id === id);
		if (!original) return false;

		this.#trainings = this.#trainings.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update personnel training');
			const updated = await res.json();
			// Replace with server response
			this.#trainings = this.#trainings.map((t) => (t.id === id ? updated : t));
			return true;
		} catch {
			// Rollback on failure
			this.#trainings = this.#trainings.map((t) => (t.id === id ? original : t));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#trainings.find((t) => t.id === id);
		if (!original) return false;

		this.#trainings = this.#trainings.filter((t) => t.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete personnel training');
			return true;
		} catch {
			// Rollback on failure
			this.#trainings = [...this.#trainings, original];
			return false;
		}
	}

	getById(id: string) {
		return this.#trainings.find((t) => t.id === id);
	}

	getByPersonnelAndType(personnelId: string, trainingTypeId: string) {
		return this.#trainings.find(
			(t) => t.personnelId === personnelId && t.trainingTypeId === trainingTypeId
		);
	}

	removeByPersonnelLocal(personnelId: string) {
		this.#trainings = this.#trainings.filter((t) => t.personnelId !== personnelId);
	}

	removeByTrainingTypeLocal(trainingTypeId: string) {
		this.#trainings = this.#trainings.filter((t) => t.trainingTypeId !== trainingTypeId);
	}
}

export const personnelTrainingsStore = new PersonnelTrainingsStore();
