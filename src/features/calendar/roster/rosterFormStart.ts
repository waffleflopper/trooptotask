import type { DateKey } from './rosterTypes';

/** Only the inaugural form can include duty entered before its stored start. */
export function effectiveRosterFormStart(input: {
	startsOn: DateKey;
	hasClosedPredecessor: boolean;
	hasCarriedNumbers: boolean;
	firstAssignment: DateKey | null;
}): DateKey {
	const { startsOn, hasClosedPredecessor, hasCarriedNumbers, firstAssignment } = input;
	if (hasClosedPredecessor || hasCarriedNumbers) return startsOn;
	return firstAssignment !== null && firstAssignment < startsOn ? firstAssignment : startsOn;
}
