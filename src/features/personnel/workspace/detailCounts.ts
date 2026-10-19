import { invalidate } from '$app/navigation';

export const PERSONNEL_DETAIL_COUNTS_KEY = 'app:personnel-detail-counts';

export function refreshPersonnelDetailCounts(): Promise<void> {
	return invalidate(PERSONNEL_DETAIL_COUNTS_KEY);
}
