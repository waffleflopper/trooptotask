import type { Personnel } from '$lib/types';
import type { PersonnelGroup } from '$features/personnel/utils/personnelGrouping';
import type { ScopeSet } from '$lib/access/memberAccessShape';

export function scopePersonnel(personnel: Personnel[], scopedGroupId: string | null): Personnel[] {
	if (!scopedGroupId) return personnel;
	return personnel.filter((p) => p.groupId === scopedGroupId);
}

export function scopePersonnelByGroup(groups: PersonnelGroup[], scopedGroupId: string | null): PersonnelGroup[] {
	if (!scopedGroupId) return groups;
	return groups.filter((g) => g.personnel.some((p) => p.groupId === scopedGroupId));
}

export function scopePersonnelByScopeSet(personnel: Personnel[], scopeSet: ScopeSet): Personnel[] {
	if (scopeSet.kind === 'organization') return personnel;
	const scopedGroupIds = new Set(scopeSet.groupIds);
	return personnel.filter((p) => p.groupId !== null && scopedGroupIds.has(p.groupId));
}

export function scopePersonnelByGroupScopeSet(groups: PersonnelGroup[], scopeSet: ScopeSet): PersonnelGroup[] {
	if (scopeSet.kind === 'organization') return groups;
	const scopedGroupIds = new Set(scopeSet.groupIds);
	return groups
		.map((group) => ({
			...group,
			personnel: group.personnel.filter((person) => person.groupId !== null && scopedGroupIds.has(person.groupId))
		}))
		.filter((group) => group.personnel.length > 0);
}
