import type { CounselingRecord } from '../types/leadersBook';
import type { DeleteResult } from '../utils/deletionRequests';

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
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticRecord: CounselingRecord = { id: tempId, ...data };
		this.#counselingRecords = [...this.#counselingRecords, optimisticRecord];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add counseling record');
			const newRecord = await res.json();
			// Replace temp with real data
			this.#counselingRecords = this.#counselingRecords.map((r) => (r.id === tempId ? newRecord : r));
			return newRecord;
		} catch {
			// Rollback on failure
			this.#counselingRecords = this.#counselingRecords.filter((r) => r.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<CounselingRecord, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#counselingRecords.find((r) => r.id === id);
		if (!original) return false;

		this.#counselingRecords = this.#counselingRecords.map((r) => (r.id === id ? { ...r, ...data } : r));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update counseling record');
			const updated = await res.json();
			// Replace with server response
			this.#counselingRecords = this.#counselingRecords.map((r) => (r.id === id ? updated : r));
			return true;
		} catch {
			// Rollback on failure
			this.#counselingRecords = this.#counselingRecords.map((r) => (r.id === id ? original : r));
			return false;
		}
	}

	async remove(id: string): Promise<DeleteResult> {
		// Optimistic: remove immediately
		const original = this.#counselingRecords.find((r) => r.id === id);
		if (!original) return 'error';

		this.#counselingRecords = this.#counselingRecords.filter((r) => r.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/counseling-records`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});

			if (res.status === 202) {
				const data = await res.json();
				if (data.requiresApproval) {
					this.#counselingRecords = [...this.#counselingRecords, original];
					return 'approval_required';
				}
			}

			if (!res.ok) throw new Error('Failed to delete counseling record');
			return 'deleted';
		} catch {
			// Rollback on failure
			this.#counselingRecords = [...this.#counselingRecords, original];
			return 'error';
		}
	}

	// Remove records by type locally (used when a type is deleted)
	removeByTypeLocal(typeId: string) {
		this.#counselingRecords = this.#counselingRecords.filter(
			(r) => r.counselingTypeId !== typeId
		);
	}
}

export const counselingRecordsStore = new CounselingRecordsStore();
