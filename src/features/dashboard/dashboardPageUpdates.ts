import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';

/** A record the viewer just saved, for the list in the static page data it belongs to. */
export type DashboardRecordChange =
	| { list: 'activeOnboardings'; record: PersonnelOnboarding }
	| { list: 'ratingSchemeEntries'; record: RatingSchemeDueEntry }
	| { list: 'awardTrackingAcknowledgedPersonnelIds'; personnelId: string };

/** Completions the viewer just recorded for one training type. */
export interface DashboardSummaryChange {
	trainingTypeId: string;
	recordedPersonnelIds: readonly string[];
}

/** How a save made on the Dashboard shows up without reloading the page. */
export interface DashboardPageUpdates {
	/**
	 * Rereads the server summary in the background; the page keeps its last values until the read lands, and keeps them if it fails.
	 * A change made in the page's Organization shows on those values meanwhile.
	 */
	refreshSummary(meanwhile?: { orgId: string; change: DashboardSummaryChange }): void;
	/** Shows a record saved in the Organization in its list until the page data is next read; ignored once the page has moved to another Organization. */
	putRecord(orgId: string, change: DashboardRecordChange): void;
}

/** Changes saved on top of one read; a newer read already includes them, so the overlay drops. */
interface DashboardOverlay<Base, Change> {
	base: Base;
	changes: readonly Change[];
}

export type DashboardRecordOverlay = DashboardOverlay<DashboardWorkspaceResult, DashboardRecordChange>;
export type DashboardSummaryOverlay = DashboardOverlay<DashboardPageSummaryData, DashboardSummaryChange>;

function putChange<Base, Change>(
	overlay: DashboardOverlay<Base, Change> | null,
	base: Base,
	change: Change
): DashboardOverlay<Base, Change> {
	return { base, changes: [...(overlay?.base === base ? overlay.changes : []), change] };
}

export function putDashboardRecord(
	overlay: DashboardRecordOverlay | null,
	base: DashboardWorkspaceResult,
	change: DashboardRecordChange
): DashboardRecordOverlay {
	return putChange(overlay, base, change);
}

export function putDashboardSummaryChange(
	overlay: DashboardSummaryOverlay | null,
	base: DashboardPageSummaryData,
	change: DashboardSummaryChange
): DashboardSummaryOverlay {
	return putChange(overlay, base, change);
}

function upsert<T extends { id: string }>(records: readonly T[], record: T): T[] {
	return records.some((existing) => existing.id === record.id)
		? records.map((existing) => (existing.id === record.id ? record : existing))
		: [...records, record];
}

export function overlayDashboardRecords(
	dashboard: DashboardWorkspaceResult,
	overlay: DashboardRecordOverlay | null
): DashboardWorkspaceResult {
	if (overlay?.base !== dashboard || overlay.changes.length === 0) return dashboard;
	const data = { ...dashboard.data };
	for (const change of overlay.changes) {
		switch (change.list) {
			case 'activeOnboardings':
				data.activeOnboardings = upsert(data.activeOnboardings, change.record);
				break;
			case 'ratingSchemeEntries':
				data.ratingSchemeEntries = upsert(data.ratingSchemeEntries, change.record);
				break;
			case 'awardTrackingAcknowledgedPersonnelIds':
				if (!data.awardTrackingAcknowledgedPersonnelIds.includes(change.personnelId))
					data.awardTrackingAcknowledgedPersonnelIds = [
						...data.awardTrackingAcknowledgedPersonnelIds,
						change.personnelId
					];
				break;
		}
	}
	return { ...dashboard, data };
}

/** Takes the recorded People off their type's expired list; counts the server derives wait for the refresh. */
export function overlayDashboardSummary(
	summary: DashboardPageSummaryData,
	overlay: DashboardSummaryOverlay | null
): DashboardPageSummaryData {
	const training = summary.trainingSummary;
	if (overlay?.base !== summary || overlay.changes.length === 0 || !training) return summary;
	let expiredByType = training.expiredByType;
	for (const { trainingTypeId, recordedPersonnelIds } of overlay.changes) {
		expiredByType = expiredByType.flatMap((expired) => {
			if (expired.trainingTypeId !== trainingTypeId) return [expired];
			const personnelIds = expired.personnelIds.filter((id) => !recordedPersonnelIds.includes(id));
			return personnelIds.length > 0 ? [{ ...expired, personnelIds }] : [];
		});
	}
	return { ...summary, trainingSummary: { ...training, expiredByType } };
}
