import { invalidate } from '$app/navigation';

/** Tab badges count records, so a record write refreshes the detail layout without rerunning the open tab's load. */
export const PERSONNEL_DETAIL_COUNTS_KEY = 'app:personnel-detail-counts';

export function refreshPersonnelDetailCounts(): Promise<void> {
	return invalidate(PERSONNEL_DETAIL_COUNTS_KEY);
}
