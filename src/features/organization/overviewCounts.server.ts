/** Bound to one Organization. Each method is one count under the request's own access. */
export interface OrganizationOverviewCountsPort {
	countActiveUngroupedPeople(): Promise<number>;
	/** Members scoped to Groups where none of the stored Groups still exists. */
	countMembersCoveringNoGroups(): Promise<number>;
}
