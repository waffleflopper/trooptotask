import type { Personnel } from '../types';

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
		const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newPerson = await res.json();
		this.#personnel = [...this.#personnel, newPerson];
		return newPerson;
	}

	async update(id: string, data: Partial<Omit<Personnel, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#personnel = this.#personnel.map((p) => (p.id === id ? updated : p));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#personnel = this.#personnel.filter((p) => p.id !== id);
		return true;
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
