import type { DevelopmentGoal } from '../counseling.types';
import type { DeleteResult } from '$lib/utils/deletionRequests';

class DevelopmentGoalsStore {
	#goals = $state.raw<DevelopmentGoal[]>([]);
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
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticGoal: DevelopmentGoal = { id: tempId, ...data };
		this.#goals = [...this.#goals, optimisticGoal];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add development goal');
			const newGoal = await res.json();
			// Replace temp with real data
			this.#goals = this.#goals.map((g) => (g.id === tempId ? newGoal : g));
			return newGoal;
		} catch {
			// Rollback on failure
			this.#goals = this.#goals.filter((g) => g.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<DevelopmentGoal, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#goals.find((g) => g.id === id);
		if (!original) return false;

		this.#goals = this.#goals.map((g) => (g.id === id ? { ...g, ...data } : g));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update development goal');
			const updated = await res.json();
			// Replace with server response
			this.#goals = this.#goals.map((g) => (g.id === id ? updated : g));
			return true;
		} catch {
			// Rollback on failure
			this.#goals = this.#goals.map((g) => (g.id === id ? original : g));
			return false;
		}
	}

	async remove(id: string): Promise<DeleteResult> {
		// Optimistic: remove immediately
		const original = this.#goals.find((g) => g.id === id);
		if (!original) return 'error';

		this.#goals = this.#goals.filter((g) => g.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/development-goals`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});

			if (res.status === 202) {
				const data = await res.json();
				if (data.requiresApproval) {
					this.#goals = [...this.#goals, original];
					return 'approval_required';
				}
			}

			if (!res.ok) throw new Error('Failed to delete development goal');
			return 'deleted';
		} catch {
			// Rollback on failure
			this.#goals = [...this.#goals, original];
			return 'error';
		}
	}
}

export const developmentGoalsStore = new DevelopmentGoalsStore();
