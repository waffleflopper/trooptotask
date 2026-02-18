import type { DevelopmentGoal } from '../types/leadersBook';

class DevelopmentGoalsStore {
	#goals = $state<DevelopmentGoal[]>([]);
	#orgId = '';

	get list() {
		return this.#goals;
	}

	load(goals: DevelopmentGoal[], orgId: string) {
		this.#goals = goals;
		this.#orgId = orgId;
	}

	getById(id: string): DevelopmentGoal | undefined {
		return this.#goals.find((g) => g.id === id);
	}

	getByPersonnelId(personnelId: string): DevelopmentGoal[] {
		return this.#goals.filter((g) => g.personnelId === personnelId);
	}

	async add(data: Omit<DevelopmentGoal, 'id'>): Promise<DevelopmentGoal | null> {
		const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newGoal = await res.json();
		this.#goals = [...this.#goals, newGoal];
		return newGoal;
	}

	async update(id: string, data: Partial<Omit<DevelopmentGoal, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#goals = this.#goals.map((g) => (g.id === id ? updated : g));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#goals = this.#goals.filter((g) => g.id !== id);
		return true;
	}
}

export const developmentGoalsStore = new DevelopmentGoalsStore();
