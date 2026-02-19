import type { SpecialDay } from '../types';
import { formatDate } from '../utils/dates';

class SpecialDaysStore {
	#specialDays = $state<SpecialDay[]>([]);
	#orgId = '';

	get list() {
		return this.#specialDays;
	}

	load(specialDays: SpecialDay[], orgId: string) {
		this.#specialDays = specialDays;
		this.#orgId = orgId;
	}

	async add(data: Omit<SpecialDay, 'id'>): Promise<SpecialDay | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimisticDay: SpecialDay = { id: tempId, ...data };
		this.#specialDays = [...this.#specialDays, optimisticDay];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/special-days`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add special day');
			const newDay = await res.json();
			// Replace temp with real data
			this.#specialDays = this.#specialDays.map((d) => (d.id === tempId ? newDay : d));
			return newDay;
		} catch {
			// Rollback on failure
			this.#specialDays = this.#specialDays.filter((d) => d.id !== tempId);
			return null;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#specialDays.find((d) => d.id === id);
		if (!original) return false;

		this.#specialDays = this.#specialDays.filter((d) => d.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/special-days`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete special day');
			return true;
		} catch {
			// Rollback on failure
			this.#specialDays = [...this.#specialDays, original];
			return false;
		}
	}

	async resetFederalHolidays(): Promise<boolean> {
		const res = await fetch(`/org/${this.#orgId}/api/special-days`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'resetFederalHolidays' })
		});
		if (!res.ok) return false;
		const allDays = await res.json();
		this.#specialDays = allDays;
		return true;
	}

	getById(id: string) {
		return this.#specialDays.find((d) => d.id === id);
	}

	getByDate(date: Date): SpecialDay | undefined {
		const dateStr = formatDate(date);
		return this.#specialDays.find((d) => d.date === dateStr);
	}

	isSpecialDay(date: Date): boolean {
		const dateStr = formatDate(date);
		return this.#specialDays.some((d) => d.date === dateStr);
	}

	getByYear(year: number): SpecialDay[] {
		return this.#specialDays.filter((d) => d.date.startsWith(`${year}-`));
	}
}

export const specialDaysStore = new SpecialDaysStore();
