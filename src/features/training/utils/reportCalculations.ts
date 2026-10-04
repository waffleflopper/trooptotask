import type { Personnel } from '$features/personnel/contracts';

/** MOS and duty role accept one value or a multi-selection; an empty selection matches everyone. */
export interface PersonnelFilters {
	groupId?: string;
	rank?: string;
	mos?: string | string[];
	role?: string | string[];
}

function matchesSelection(value: string, selection: string | string[] | undefined): boolean {
	if (Array.isArray(selection)) return selection.length === 0 || selection.includes(value);
	return !selection || value === selection;
}

export function filterPersonnel(personnel: Personnel[], filters: PersonnelFilters): Personnel[] {
	return personnel.filter((p) => {
		if (filters.groupId && p.groupId !== filters.groupId) return false;
		if (!matchesSelection(p.mos, filters.mos)) return false;
		if (!matchesSelection(p.clinicRole, filters.role)) return false;
		if (filters.rank && p.rank.trim() !== filters.rank.trim()) return false;
		return true;
	});
}
