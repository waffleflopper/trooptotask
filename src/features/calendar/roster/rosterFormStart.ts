import type { DateKey } from './rosterTypes';

/** Only the inaugural form, without carried numbers, can include duty entered before its stored start. */
export function formStartFollowsDuty(input: { hasClosedPredecessor: boolean; hasCarriedNumbers: boolean }): boolean {
	return !input.hasClosedPredecessor && !input.hasCarriedNumbers;
}

export function effectiveRosterFormStart(input: {
	startsOn: DateKey;
	hasClosedPredecessor: boolean;
	hasCarriedNumbers: boolean;
	firstAssignment: DateKey | null;
}): DateKey {
	const { startsOn, firstAssignment } = input;
	if (!formStartFollowsDuty(input)) return startsOn;
	return firstAssignment !== null && firstAssignment < startsOn ? firstAssignment : startsOn;
}
