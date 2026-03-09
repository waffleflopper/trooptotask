import type { Personnel } from '../types';
import type { DeleteResult } from '../utils/deletionRequests';

class PersonnelStore {
	#personnel = $state<Personnel[]>([]);
	#orgId = '';

	get list() {
		return this.#personnel;
	}

	load(personnel: Personnel[], orgId: string) {
		this.#personnel = personnel;
		this.#orgId = orgId;
	}

	async add(data: Omit<Personnel, 'id'>): Promise<Personnel | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticPerson: Personnel = { id: tempId, ...data } as Personnel;
		this.#personnel = [...this.#personnel, optimisticPerson];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add personnel');
			const newPerson = await res.json();
			// Replace temp with real data
			this.#personnel = this.#personnel.map((p) => (p.id === tempId ? newPerson : p));
			return newPerson;
		} catch {
			// Rollback on failure
			this.#personnel = this.#personnel.filter((p) => p.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<Personnel, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#personnel.find((p) => p.id === id);
		if (!original) return false;

		this.#personnel = this.#personnel.map((p) => (p.id === id ? { ...p, ...data } : p));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update personnel');
			const updated = await res.json();
			// Replace with server response (may have computed fields)
			this.#personnel = this.#personnel.map((p) => (p.id === id ? updated : p));
			return true;
		} catch {
			// Rollback on failure
			this.#personnel = this.#personnel.map((p) => (p.id === id ? original : p));
			return false;
		}
	}

	async remove(id: string): Promise<DeleteResult> {
		// Optimistic: remove immediately
		const original = this.#personnel.find((p) => p.id === id);
		if (!original) return 'error';

		this.#personnel = this.#personnel.filter((p) => p.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});

			if (res.status === 202) {
				const data = await res.json();
				if (data.requiresApproval) {
					// Rollback — item not actually deleted
					this.#personnel = [...this.#personnel, original];
					return 'approval_required';
				}
			}

			if (!res.ok) throw new Error('Failed to delete personnel');
			return 'deleted';
		} catch {
			// Rollback on failure
			this.#personnel = [...this.#personnel, original];
			return 'error';
		}
	}

	// For local-only removal (used after cascade deletes)
	removeLocal(id: string) {
		this.#personnel = this.#personnel.filter((p) => p.id !== id);
	}

	getById(id: string) {
		return this.#personnel.find((p) => p.id === id);
	}

	sortByRankAndName() {
		const rankOrder = [
			'PV1', 'PV2', 'PFC', 'SPC', 'CPL',
			'SGT', 'SSG', 'SFC', 'MSG', '1SG', 'SGM', 'CSM',
			'WO1', 'CW2', 'CW3', 'CW4', 'CW5',
			'2LT', '1LT', 'CPT', 'MAJ', 'LTC', 'COL', 'BG', 'MG', 'LTG', 'GEN'
		];

		return [...this.#personnel].sort((a, b) => {
			const rankDiff = rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank);
			if (rankDiff !== 0) return rankDiff;
			return a.lastName.localeCompare(b.lastName);
		});
	}
}

export const personnelStore = new PersonnelStore();
