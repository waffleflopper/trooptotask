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
		const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newTraining = await res.json();
		// Upsert logic: remove existing if present, then add new
		this.#trainings = this.#trainings.filter(
			(t) => !(t.personnelId === newTraining.personnelId && t.trainingTypeId === newTraining.trainingTypeId)
		);
		this.#trainings = [...this.#trainings, newTraining];
		return newTraining;
	}

	async update(id: string, data: Partial<Omit<PersonnelTraining, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#trainings = this.#trainings.map((t) => (t.id === id ? updated : t));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel-trainings`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#trainings = this.#trainings.filter((t) => t.id !== id);
		return true;
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
