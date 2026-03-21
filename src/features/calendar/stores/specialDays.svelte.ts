import { createStore } from '$lib/stores/core';
import { formatDate } from '$lib/utils/dates';
import type { SpecialDay } from '$lib/types';

const store = createStore<SpecialDay>({ resource: 'special-days' });

export const specialDaysStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	remove: store.removeBool,

	async resetFederalHolidays(): Promise<boolean> {
		const res = await fetch(`/org/${store.orgId}/api/special-days`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'resetFederalHolidays' })
		});
		if (!res.ok) return false;
		const allDays = await res.json();
		store.removeLocalWhere(() => true);
		store.appendLocal(allDays);
		return true;
	},

	getById: store.getById,

	getByDate(date: Date): SpecialDay | undefined {
		const dateStr = formatDate(date);
		return store.find((d) => d.date === dateStr);
	},

	isSpecialDay(date: Date): boolean {
		const dateStr = formatDate(date);
		return store.find((d) => d.date === dateStr) !== undefined;
	},

	getByYear(year: number): SpecialDay[] {
		return store.filter((d) => d.date.startsWith(`${year}-`));
	}
};
