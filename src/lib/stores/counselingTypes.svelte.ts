import type { CounselingType } from '../types/leadersBook';

class CounselingTypesStore {
	#counselingTypes = $state<CounselingType[]>([]);
	#orgId = '';

	get list() {
		return this.#counselingTypes;
	}

	load(counselingTypes: CounselingType[], orgId: string) {
		this.#counselingTypes = counselingTypes;
		this.#orgId = orgId;
	}

	getById(id: string): CounselingType | undefined {
		return this.#counselingTypes.find((t) => t.id === id);
	}

	async add(data: Omit<CounselingType, 'id'>): Promise<CounselingType | null> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newType = await res.json();
		this.#counselingTypes = [...this.#counselingTypes, newType];
		return newType;
	}

	async update(id: string, data: Partial<Omit<CounselingType, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#counselingTypes = this.#counselingTypes.map((t) => (t.id === id ? updated : t));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#counselingTypes = this.#counselingTypes.filter((t) => t.id !== id);
		return true;
	}
}

export const counselingTypesStore = new CounselingTypesStore();
