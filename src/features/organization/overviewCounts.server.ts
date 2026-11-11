/** Bound to one Organization. Each method is one count under the request's own access. */
export interface OrganizationOverviewCountsPort {
	/** Active people with no Group, the Unassigned band on the Personnel roster. */
	countUngroupedPeople(): Promise<number>;
	/** Members scoped to Groups where none of the stored Groups still exists. */
	countMembersCoveringNoGroups(): Promise<number>;
}

/**
 * A deleted Group leaves its id in a member's stored scope, and coverage is the Groups whose path overlaps the stored
 * ids, so a scope covers nothing exactly when none of its ids is a Group the Organization still has.
 */
export function countScopesCoveringNoGroups(
	groupIds: Iterable<string>,
	storedScopes: readonly (readonly string[] | null)[]
): number {
	const live = new Set(groupIds);
	return storedScopes.filter((ids) => !(ids ?? []).some((id) => live.has(id))).length;
}
