import {
	classifyWrite,
	rejectedRequestMessage,
	stillInOrganizationLifetime,
	withinOrganizationLifetime
} from '$lib/stores/core';
import { PERSONNEL_FIELD_BATCH_LIMIT, type PersonnelFieldBulkResult, type PersonnelFieldChange } from './contracts';
import type { Personnel } from './personnel.types';
import { withFieldChange } from './personnelFieldChange';
import type { RosterPeek } from './rosterPeek.svelte';
import { personnelStore } from './stores/personnel.svelte';
import { PERSONNEL_FIELD_UNCONFIRMED_MESSAGE, setPersonnelField } from './utils/setPersonnelField';

export interface RosterFieldSaveDeps {
	orgId: string;
	/** False once the roster that started the save is gone, such as after switching Organization. */
	isCurrent: () => boolean;
	peek: Pick<RosterPeek, 'changed'>;
	refreshSignals: (ids: string[]) => void;
	save?: typeof setPersonnelField;
}

/** A batch that failed. The batches after it were never sent. */
export interface RosterFieldInterruption {
	outcome: 'not-saved' | 'unconfirmed';
	/** The failed batch's People. */
	failedIds: string[];
	/** People in the later batches, which were not saved. */
	unsentIds: string[];
	message: string;
}

export interface RosterFieldSaveResult {
	/** What the batches the server answered did. */
	answered: PersonnelFieldBulkResult;
	interrupted: RosterFieldInterruption | null;
}

/**
 * Saves one field for these People in batches the endpoint accepts, mirroring each batch's updated People into the
 * roster before sending the next, so a later failure leaves the confirmed ones shown and reported. A reply that
 * arrives after the user left the Organization never settles and writes nothing.
 */
export async function saveRosterField(
	targets: readonly Personnel[],
	change: PersonnelFieldChange,
	ids: string[],
	{ orgId, isCurrent, peek, refreshSignals, save = setPersonnelField }: RosterFieldSaveDeps
): Promise<RosterFieldSaveResult> {
	const inLifetime = stillInOrganizationLifetime();
	const answered: PersonnelFieldBulkResult = {
		field: change.field,
		value: change.value,
		updatedIds: [],
		refusedIds: [],
		unavailableIds: []
	};
	for (let start = 0; start < ids.length; start += PERSONNEL_FIELD_BATCH_LIMIT) {
		const batch = ids.slice(start, start + PERSONNEL_FIELD_BATCH_LIMIT);
		let result: PersonnelFieldBulkResult;
		try {
			result = await withinOrganizationLifetime(save(orgId, batch, change), () => inLifetime() && isCurrent());
		} catch (error) {
			const outcome = classifyWrite(error) === 'not-saved' ? 'not-saved' : 'unconfirmed';
			const fallback = outcome === 'not-saved' ? 'The change was not saved.' : PERSONNEL_FIELD_UNCONFIRMED_MESSAGE;
			return {
				answered,
				interrupted: {
					outcome,
					failedIds: batch,
					unsentIds: ids.slice(start + batch.length),
					message: rejectedRequestMessage(error, fallback)
				}
			};
		}
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
		answered.value = result.value;
		answered.updatedIds.push(...result.updatedIds);
		answered.refusedIds.push(...result.refusedIds);
		answered.unavailableIds.push(...result.unavailableIds);
	}
	return { answered, interrupted: null };
}
