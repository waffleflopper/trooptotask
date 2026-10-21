import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { DashboardWorkspaceResult } from './contracts';

/** A record the viewer just saved, for the list in the static page data it belongs to. */
export type DashboardRecordChange = { list: 'activeOnboardings'; record: PersonnelOnboarding };

/** How a save made on the Dashboard shows up without reloading the page. */
export interface DashboardPageUpdates {
	/** Rereads the server summary in the background; the page keeps its last values until the read lands, and keeps them if it fails. */
	refreshSummary(): void;
	/** Shows a record saved in the Organization in its list until the page data is next read; ignored once the page has moved to another Organization. */
	putRecord(orgId: string, change: DashboardRecordChange): void;
}

/** Records saved on top of one workspace read; a newer read already includes them, so the overlay drops. */
export interface DashboardRecordOverlay {
	base: DashboardWorkspaceResult;
	changes: readonly DashboardRecordChange[];
}

export function putDashboardRecord(
	overlay: DashboardRecordOverlay | null,
	base: DashboardWorkspaceResult,
	change: DashboardRecordChange
): DashboardRecordOverlay {
	return { base, changes: [...(overlay?.base === base ? overlay.changes : []), change] };
}

export function overlayDashboardRecords(
	dashboard: DashboardWorkspaceResult,
	overlay: DashboardRecordOverlay | null
): DashboardWorkspaceResult {
	if (overlay?.base !== dashboard || overlay.changes.length === 0) return dashboard;
	const data = { ...dashboard.data };
	for (const { list, record } of overlay.changes) {
		const records = data[list];
		data[list] = records.some((existing) => existing.id === record.id)
			? records.map((existing) => (existing.id === record.id ? record : existing))
			: [...records, record];
	}
	return { ...dashboard, data };
}
