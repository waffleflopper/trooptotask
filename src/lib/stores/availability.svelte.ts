import type { AvailabilityEntry } from '../types';
import { isDateInRange, formatDate } from '../utils/dates';

class AvailabilityStore {
	#entries = $state.raw<AvailabilityEntry[]>([]);
	#orgId = '';

	get list() {
		return this.#entries;
	}

	load(entries: AvailabilityEntry[], orgId: string) {
		this.#entries = entries;
		this.#orgId = orgId;
	}

	async add(data: Omit<AvailabilityEntry, 'id'>): Promise<AvailabilityEntry | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticEntry: AvailabilityEntry = { id: tempId, ...data };
		this.#entries = [...this.#entries, optimisticEntry];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/availability`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add availability');
			const newEntry = await res.json();
			// Replace temp with real data
			this.#entries = this.#entries.map((e) => (e.id === tempId ? newEntry : e));
			return newEntry;
		} catch {
			// Rollback on failure
			this.#entries = this.#entries.filter((e) => e.id !== tempId);
			return null;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#entries.find((e) => e.id === id);
		if (!original) return false;

		this.#entries = this.#entries.filter((e) => e.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/availability`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete availability');
			return true;
		} catch {
			// Rollback on failure
			this.#entries = [...this.#entries, original];
			return false;
		}
	}

	// Local-only removal for cascade operations
	removeByPersonnelLocal(personnelId: string) {
		this.#entries = this.#entries.filter((e) => e.personnelId !== personnelId);
	}

	removeByStatusTypeLocal(statusTypeId: string) {
		this.#entries = this.#entries.filter((e) => e.statusTypeId !== statusTypeId);
	}

	getById(id: string) {
		return this.#entries.find((e) => e.id === id);
	}

	getByPersonnel(personnelId: string) {
		return this.#entries.filter((e) => e.personnelId === personnelId);
	}

	getByPersonnelAndDate(personnelId: string, date: Date): AvailabilityEntry[] {
		return this.#entries.filter(
			(e) => e.personnelId === personnelId && isDateInRange(date, e.startDate, e.endDate)
		);
	}

	getByDate(date: Date): AvailabilityEntry[] {
		return this.#entries.filter((e) => isDateInRange(date, e.startDate, e.endDate));
	}

	getByDateRange(startDate: Date, endDate: Date): AvailabilityEntry[] {
		const start = formatDate(startDate);
		const end = formatDate(endDate);
		return this.#entries.filter(
			(e) =>
				(e.startDate >= start && e.startDate <= end) ||
				(e.endDate >= start && e.endDate <= end) ||
				(e.startDate <= start && e.endDate >= end)
		);
	}
}

export const availabilityStore = new AvailabilityStore();
