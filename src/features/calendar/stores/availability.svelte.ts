import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { AvailabilityEntry } from '../calendar.types';
import { isDateInRange, formatDate } from '$lib/utils/dates';

const store = createCrudStore<AvailabilityEntry>({ resource: 'availability' });

export const availabilityStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	remove: store.removeBool,

	async addBatch(entries: Omit<AvailabilityEntry, 'id'>[]): Promise<AvailabilityEntry[]> {
		const tempEntries: AvailabilityEntry[] = entries.map((e) => ({
			id: `temp-${crypto.randomUUID()}`,
			...e
		}));
		store.setItems([...store.getItems(), ...tempEntries]);

		try {
			const res = await fetch(`/org/${store.getOrgId()}/api/availability/batch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ records: entries })
			});
			if (!res.ok) throw new Error('Failed to add availability batch');
			const data = await res.json();
			const inserted: AvailabilityEntry[] = data.inserted;
			const tempIds = new Set(tempEntries.map((e) => e.id));
			store.setItems([...store.getItems().filter((e) => !tempIds.has(e.id)), ...inserted]);
			return inserted;
		} catch {
			const tempIds = new Set(tempEntries.map((e) => e.id));
			store.setItems(store.getItems().filter((e) => !tempIds.has(e.id)));
			return [];
		}
	},

	async removeBatch(ids: string[]): Promise<boolean> {
		const removedEntries = store.getItems().filter((e) => ids.includes(e.id));
		store.setItems(store.getItems().filter((e) => !ids.includes(e.id)));

		try {
			const res = await fetch(`/org/${store.getOrgId()}/api/availability/batch`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			if (!res.ok) throw new Error('Failed to delete availability batch');
			return true;
		} catch {
			store.setItems([...store.getItems(), ...removedEntries]);
			return false;
		}
	},

	removeByPersonnelLocal: (personnelId: string) =>
		store.setItems(store.getItems().filter((e) => e.personnelId !== personnelId)),

	removeByStatusTypeLocal: (statusTypeId: string) =>
		store.setItems(store.getItems().filter((e) => e.statusTypeId !== statusTypeId)),

	getById: (id: string) => store.getItems().find((e) => e.id === id),
	getByPersonnel: (personnelId: string) => store.getItems().filter((e) => e.personnelId === personnelId),

	getByPersonnelAndDate: (personnelId: string, date: Date) =>
		store.getItems().filter((e) => e.personnelId === personnelId && isDateInRange(date, e.startDate, e.endDate)),

	getByDate: (date: Date) => store.getItems().filter((e) => isDateInRange(date, e.startDate, e.endDate)),

	getByDateRange(startDate: Date, endDate: Date) {
		const start = formatDate(startDate);
		const end = formatDate(endDate);
		return store
			.getItems()
			.filter(
				(e) =>
					(e.startDate >= start && e.startDate <= end) ||
					(e.endDate >= start && e.endDate <= end) ||
					(e.startDate <= start && e.endDate >= end)
			);
	}
};
