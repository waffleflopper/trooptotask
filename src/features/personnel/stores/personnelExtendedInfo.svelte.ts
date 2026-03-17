import type { PersonnelExtendedInfo } from '$features/counseling/counseling.types';

class PersonnelExtendedInfoStore {
	#extendedInfo = $state.raw<PersonnelExtendedInfo[]>([]);
	#orgId = '';

	get list() {
		return this.#extendedInfo;
	}

	load(extendedInfo: PersonnelExtendedInfo[], orgId: string) {
		this.#extendedInfo = extendedInfo;
		this.#orgId = orgId;
	}

	getByPersonnelId(personnelId: string): PersonnelExtendedInfo | undefined {
		return this.#extendedInfo.find((e) => e.personnelId === personnelId);
	}

	async add(data: Omit<PersonnelExtendedInfo, 'id'>): Promise<PersonnelExtendedInfo | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticInfo: PersonnelExtendedInfo = { id: tempId, ...data };
		this.#extendedInfo = [...this.#extendedInfo, optimisticInfo];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add personnel extended info');
			const newInfo = await res.json();
			// Replace temp with real data
			this.#extendedInfo = this.#extendedInfo.map((e) => (e.id === tempId ? newInfo : e));
			return newInfo;
		} catch {
			// Rollback on failure
			this.#extendedInfo = this.#extendedInfo.filter((e) => e.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<PersonnelExtendedInfo, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#extendedInfo.find((e) => e.id === id);
		if (!original) return false;

		this.#extendedInfo = this.#extendedInfo.map((e) => (e.id === id ? { ...e, ...data } : e));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update personnel extended info');
			const updated = await res.json();
			// Replace with server response
			this.#extendedInfo = this.#extendedInfo.map((e) => (e.id === id ? updated : e));
			return true;
		} catch {
			// Rollback on failure
			this.#extendedInfo = this.#extendedInfo.map((e) => (e.id === id ? original : e));
			return false;
		}
	}

	async upsert(
		personnelId: string,
		data: Partial<Omit<PersonnelExtendedInfo, 'id' | 'personnelId'>>
	): Promise<PersonnelExtendedInfo | null> {
		const existing = this.getByPersonnelId(personnelId);
		if (existing) {
			const success = await this.update(existing.id, data);
			return success ? (this.getByPersonnelId(personnelId) ?? null) : null;
		} else {
			return this.add({ personnelId, ...data } as Omit<PersonnelExtendedInfo, 'id'>);
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#extendedInfo.find((e) => e.id === id);
		if (!original) return false;

		this.#extendedInfo = this.#extendedInfo.filter((e) => e.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete personnel extended info');
			return true;
		} catch {
			// Rollback on failure
			this.#extendedInfo = [...this.#extendedInfo, original];
			return false;
		}
	}
}

export const personnelExtendedInfoStore = new PersonnelExtendedInfoStore();
