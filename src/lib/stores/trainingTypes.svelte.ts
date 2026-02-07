import type { TrainingType } from '../types';

class TrainingTypesStore {
	#trainingTypes = $state<TrainingType[]>([]);
	#clinicId = '';

	get list() {
		return this.#trainingTypes;
	}

	load(trainingTypes: TrainingType[], clinicId: string) {
		this.#trainingTypes = trainingTypes;
		this.#clinicId = clinicId;
	}

	async add(data: Omit<TrainingType, 'id'>): Promise<TrainingType | null> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/training-types`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newType = await res.json();
		this.#trainingTypes = [...this.#trainingTypes, newType];
		return newType;
	}

	async update(id: string, data: Partial<Omit<TrainingType, 'id'>>): Promise<boolean> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/training-types`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#trainingTypes = this.#trainingTypes.map((t) => (t.id === id ? updated : t));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/training-types`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#trainingTypes = this.#trainingTypes.filter((t) => t.id !== id);
		return true;
	}

	getById(id: string) {
		return this.#trainingTypes.find((t) => t.id === id);
	}
}

export const trainingTypesStore = new TrainingTypesStore();
