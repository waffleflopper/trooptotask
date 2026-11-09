/**
 * Mutations go through the Training catalog route and its owner-held operations. The store keeps
 * archived types so a record can still name its type; `active` is the list to choose from and count.
 */
import { defineStore } from '$lib/stores/core';
import type { Store } from '$lib/stores/core';
import { getCatalogUsage, putCatalogArchive, type CatalogUsage } from '$lib/stores/core/catalogArchive';
import type { TrainingType } from '$features/training/training.types';

interface TrainingTypeExtensions extends Record<string, unknown> {
	/** Types that are not archived, in catalog order. Pickers, the matrix and readiness read this. */
	readonly active: TrainingType[];
	/** A new type starts active; the server decides its archive state. */
	add: (data: Omit<TrainingType, 'id' | 'archivedAt'>) => Promise<TrainingType | null>;
	/** Archives or restores a type. Rejects with the server's reason; the type keeps its place in the store. */
	setArchived: (id: string, archived: boolean) => Promise<void>;
	/** How many Training records use each type. */
	loadUsage: () => Promise<CatalogUsage>;
}

function enhance(base: Store<TrainingType>): TrainingTypeExtensions {
	const active = $derived(base.items.filter((type) => !type.archivedAt));
	return {
		get active() {
			return active;
		},
		add: (data) => base.add({ ...data, archivedAt: null }),
		async setArchived(id, archived) {
			const archivedAt = await putCatalogArchive(base.orgId, 'training-types', id, archived);
			base.updateLocalWhere(
				(type) => type.id === id,
				(type) => ({ ...type, archivedAt })
			);
		},
		loadUsage: () => getCatalogUsage(base.orgId, 'training-types')
	};
}

export const trainingTypesStore = defineStore<TrainingType, TrainingTypeExtensions>(
	{ table: 'training_types', orderBy: [{ field: 'sortOrder' }] },
	enhance
);
