import type { AvailabilityEntry } from '../types';
import { isDateInRange, formatDate } from '../utils/dates';

class AvailabilityStore {
	#entries = $state<AvailabilityEntry[]>([]);
	#orgId = '';

	get list() {
		return this.#entries;
	}

	load(entries: AvailabilityEntry[], orgId: string) {
		this.#entries = entries;
		this.#orgId = orgId;
	}

	async add(data: Omit<AvailabilityEntry, 'id'>): Promise<AvailabilityEntry | null> {
		const res = await fetch(`/org/${this.#orgId}/api/availability`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newEntry = await res.json();
		this.#entries = [...this.#entries, newEntry];
		return newEntry;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/availability`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#entries = this.#entries.filter((e) => e.id !== id);
		return true;
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
