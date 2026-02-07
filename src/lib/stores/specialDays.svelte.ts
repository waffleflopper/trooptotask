import type { SpecialDay } from '../types';
import { formatDate } from '../utils/dates';

class SpecialDaysStore {
	#specialDays = $state<SpecialDay[]>([]);
	#clinicId = '';

	get list() {
		return this.#specialDays;
	}

	load(specialDays: SpecialDay[], clinicId: string) {
		this.#specialDays = specialDays;
		this.#clinicId = clinicId;
	}

	async add(data: Omit<SpecialDay, 'id'>): Promise<SpecialDay | null> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/special-days`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data)
		});
		if (!res.ok) return null;
		const newDay = await res.json();
		this.#specialDays = [...this.#specialDays, newDay];
		return newDay;
	}

	async remove(id: string): Promise<boolean> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/special-days`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) return false;
		this.#specialDays = this.#specialDays.filter((d) => d.id !== id);
		return true;
	}

	async resetFederalHolidays(): Promise<boolean> {
		const res = await fetch(`/clinic/${this.#clinicId}/api/special-days`, {
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
