import type { PersonnelExtendedInfo } from '../types/leadersBook';

class PersonnelExtendedInfoStore {
	#extendedInfo = $state<PersonnelExtendedInfo[]>([]);
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
		const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newInfo = await res.json();
		this.#extendedInfo = [...this.#extendedInfo, newInfo];
		return newInfo;
	}

	async update(
		id: string,
		data: Partial<Omit<PersonnelExtendedInfo, 'id'>>
	): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#extendedInfo = this.#extendedInfo.map((e) => (e.id === id ? updated : e));
		return true;
	}

	async upsert(
		personnelId: string,
		data: Partial<Omit<PersonnelExtendedInfo, 'id' | 'personnelId'>>
	): Promise<PersonnelExtendedInfo | null> {
		const existing = this.getByPersonnelId(personnelId);
		if (existing) {
			const success = await this.update(existing.id, data);
			return success ? this.getByPersonnelId(personnelId) ?? null : null;
		} else {
			return this.add({ personnelId, ...data } as Omit<PersonnelExtendedInfo, 'id'>);
		}
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/personnel-extended-info`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#extendedInfo = this.#extendedInfo.filter((e) => e.id !== id);
		return true;
	}
}

export const personnelExtendedInfoStore = new PersonnelExtendedInfoStore();
