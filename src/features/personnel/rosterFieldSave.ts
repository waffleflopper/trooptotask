import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
import { PERSONNEL_FIELD_BATCH_LIMIT, type PersonnelFieldBulkResult, type PersonnelFieldChange } from './contracts';
import type { Personnel } from './personnel.types';
import { withFieldChange } from './personnelFieldChange';
import type { RosterPeek } from './rosterPeek.svelte';
import { personnelStore } from './stores/personnel.svelte';
import { setPersonnelField } from './utils/setPersonnelField';

export interface RosterFieldSaveDeps {
	orgId: string;
	/** False once the roster that started the save is gone, such as after switching Organization. */
	isCurrent: () => boolean;
	peek: Pick<RosterPeek, 'changed'>;
	refreshSignals: (ids: string[]) => void;
	save?: typeof setPersonnelField;
}

/**
 * Saves one field for these People in batches the endpoint accepts, mirroring each batch's updated People into the
 * roster before sending the next, so a later failure leaves the confirmed ones shown. A reply that arrives after the
 * user left the Organization never settles and writes nothing.
 */
export async function saveRosterField(
	targets: readonly Personnel[],
	change: PersonnelFieldChange,
	ids: string[],
	{ orgId, isCurrent, peek, refreshSignals, save = setPersonnelField }: RosterFieldSaveDeps
): Promise<PersonnelFieldBulkResult> {
	const inLifetime = stillInOrganizationLifetime();
	const combined: PersonnelFieldBulkResult = {
		field: change.field,
		value: change.value,
		updatedIds: [],
		refusedIds: [],
		unavailableIds: []
	};
	for (let start = 0; start < ids.length; start += PERSONNEL_FIELD_BATCH_LIMIT) {
		const batch = ids.slice(start, start + PERSONNEL_FIELD_BATCH_LIMIT);
		const result = await withinOrganizationLifetime(save(orgId, batch, change), () => inLifetime() && isCurrent());
		const updated = new Set(result.updatedIds);
		const saved = { field: result.field, value: result.value } as PersonnelFieldChange;
		for (const person of targets) {
			if (updated.has(person.id)) peek.changed(person.id, person, withFieldChange(person, saved));
		}
		if (updated.size) refreshSignals([...updated]);
		personnelStore.updateLocalWhere(
			(person) => updated.has(person.id),
			(person) => withFieldChange(person, saved)
		);
		combined.value = result.value;
		combined.updatedIds.push(...result.updatedIds);
		combined.refusedIds.push(...result.refusedIds);
		combined.unavailableIds.push(...result.unavailableIds);
	}
	return combined;
}
