import type { CounselingRecord } from '../types/leadersBook';

class CounselingRecordsStore {
	#counselingRecords = $state<CounselingRecord[]>([]);
	#orgId = '';

	get list() {
		return this.#counselingRecords;
	}

	load(counselingRecords: CounselingRecord[], orgId: string) {
		this.#counselingRecords = counselingRecords;
		this.#orgId = orgId;
	}

	getById(id: string): CounselingRecord | undefined {
		return this.#counselingRecords.find((r) => r.id === id);
	}

	getByPersonnelId(personnelId: string): CounselingRecord[] {
		return this.#counselingRecords.filter((r) => r.personnelId === personnelId);
	}

	async add(data: Omit<CounselingRecord, 'id'>): Promise<CounselingRecord | null> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newRecord = await res.json();
		this.#counselingRecords = [...this.#counselingRecords, newRecord];
		return newRecord;
	}

	async update(id: string, data: Partial<Omit<CounselingRecord, 'id'>>): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, ...data })
		});
		if (!res.ok) return false;
		const updated = await res.json();
		this.#counselingRecords = this.#counselingRecords.map((r) => (r.id === id ? updated : r));
		return true;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#counselingRecords = this.#counselingRecords.filter((r) => r.id !== id);
		return true;
	}

	// Remove records by type locally (used when a type is deleted)
	removeByTypeLocal(typeId: string) {
		this.#counselingRecords = this.#counselingRecords.filter(
			(r) => r.counselingTypeId !== typeId
		);
	}
}

export const counselingRecordsStore = new CounselingRecordsStore();
