import { createCrudStore } from '$lib/stores/crudStore.svelte';
import { formatDate } from '$lib/utils/dates';
import type { SpecialDay } from '../calendar.types';

const store = createCrudStore<SpecialDay>({ resource: 'special-days' });

export const specialDaysStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	remove: store.removeBool,

	async resetFederalHolidays(): Promise<boolean> {
		const res = await fetch(`/org/${store.getOrgId()}/api/special-days`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'resetFederalHolidays' })
		});
		if (!res.ok) return false;
		const allDays = await res.json();
		store.setItems(allDays);
		return true;
	},

	getById: (id: string) => store.getItems().find((d) => d.id === id),

	getByDate(date: Date): SpecialDay | undefined {
		const dateStr = formatDate(date);
		return store.getItems().find((d) => d.date === dateStr);
	},

	isSpecialDay(date: Date): boolean {
		const dateStr = formatDate(date);
		return store.getItems().some((d) => d.date === dateStr);
	},

	getByYear(year: number): SpecialDay[] {
		return store.getItems().filter((d) => d.date.startsWith(`${year}-`));
	}
};
