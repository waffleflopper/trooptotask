import type { Personnel } from '$lib/types';
import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';

export function scopePersonnel(personnel: Personnel[], scopedGroupId: string | null): Personnel[] {
	if (!scopedGroupId) return personnel;
	return personnel.filter((p) => p.groupId === scopedGroupId);
}

export function scopePersonnelByGroup(groups: PersonnelGroup[], scopedGroupId: string | null): PersonnelGroup[] {
	if (!scopedGroupId) return groups;
	return groups.filter((g) => g.personnel.some((p) => p.groupId === scopedGroupId));
}
