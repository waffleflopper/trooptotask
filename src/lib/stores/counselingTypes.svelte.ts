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
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticType: CounselingType = { id: tempId, ...data };
		this.#counselingTypes = [...this.#counselingTypes, optimisticType];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add counseling type');
			const newType = await res.json();
			// Replace temp with real data
			this.#counselingTypes = this.#counselingTypes.map((t) => (t.id === tempId ? newType : t));
			return newType;
		} catch {
			// Rollback on failure
			this.#counselingTypes = this.#counselingTypes.filter((t) => t.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<CounselingType, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#counselingTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#counselingTypes = this.#counselingTypes.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update counseling type');
			const updated = await res.json();
			// Replace with server response
			this.#counselingTypes = this.#counselingTypes.map((t) => (t.id === id ? updated : t));
			return true;
		} catch {
			// Rollback on failure
			this.#counselingTypes = this.#counselingTypes.map((t) => (t.id === id ? original : t));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#counselingTypes.find((t) => t.id === id);
		if (!original) return false;

		this.#counselingTypes = this.#counselingTypes.filter((t) => t.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-types`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete counseling type');
			return true;
		} catch {
			// Rollback on failure
			this.#counselingTypes = [...this.#counselingTypes, original];
			return false;
		}
	}
}

export const counselingTypesStore = new CounselingTypesStore();
