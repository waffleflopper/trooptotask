/** Bound to one Organization. Each method is one count under the request's own access. */
export interface OrganizationOverviewCountsPort {
	countActiveUngroupedPeople(): Promise<number>;
	/** Members scoped to Groups where none of the stored Groups still exists. */
	countMembersCoveringNoGroups(): Promise<number>;
}

export function countScopesCoveringNoGroups(
	groupIds: Iterable<string>,
	storedScopes: readonly (readonly string[] | null)[]
): number {
	const live = new Set(groupIds);
	return storedScopes.filter((ids) => !(ids ?? []).some((id) => live.has(id))).length;
}
