import { getBrowserLocalStorage } from '$lib/utils/browserStorage';
import {
	DUTY_FILTER_FACETS,
	EMPTY_DUTY_FILTER,
	type DutyFilterFacet,
	type DutyPickerFilter
} from '../utils/dutyPickerFilter';

const keyFor = (typeId: string) => `t2t:duty-picker-filter:${typeId}`;

/** The filter last used for this assignment type in this browser; empty when none, unreadable or malformed. */
export function readDutyFilter(typeId: string): DutyPickerFilter {
	try {
		const parsed: unknown = JSON.parse(getBrowserLocalStorage()?.getItem(keyFor(typeId)) ?? 'null');
		if (typeof parsed !== 'object' || parsed === null) return EMPTY_DUTY_FILTER;
		const record = parsed as Record<string, unknown>;
		const read = (key: DutyFilterFacet) => {
			const values = record[key];
			return Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [];
		};
		return { rank: read('rank'), role: read('role'), mos: read('mos') };
	} catch {
		return EMPTY_DUTY_FILTER;
	}
}

/** An empty filter removes the entry. A browser that cannot store simply does not remember. */
export function writeDutyFilter(typeId: string, filter: DutyPickerFilter): void {
	try {
		const storage = getBrowserLocalStorage();
		if (!storage) return;
		if (DUTY_FILTER_FACETS.every(({ key }) => filter[key].length === 0)) storage.removeItem(keyFor(typeId));
		else storage.setItem(keyFor(typeId), JSON.stringify(filter));
	} catch {
		// Storage can be full or blocked; the filter still works for this session.
	}
}
