import { createCrudStore } from '$lib/stores/crudStore.svelte';
import type { PersonnelExtendedInfo } from '$features/counseling/counseling.types';

const store = createCrudStore<PersonnelExtendedInfo>({ resource: 'personnel-extended-info' });

export const personnelExtendedInfoStore = {
	get list() {
		return store.items;
	},
	load: store.load,
	add: store.add,
	update: store.update,
	remove: store.removeBool,
	getByPersonnelId: (personnelId: string) => store.getItems().find((e) => e.personnelId === personnelId),

	async upsert(
		personnelId: string,
		data: Partial<Omit<PersonnelExtendedInfo, 'id' | 'personnelId'>>
	): Promise<PersonnelExtendedInfo | null> {
		const existing = store.getItems().find((e) => e.personnelId === personnelId);
		if (existing) {
			const success = await store.update(existing.id, data);
			return success ? (store.getItems().find((e) => e.personnelId === personnelId) ?? null) : null;
		} else {
			return store.add({ personnelId, ...data } as Omit<PersonnelExtendedInfo, 'id'>);
		}
	}
};
