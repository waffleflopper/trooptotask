import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';

/** A record the viewer just saved, for the list in the static page data it belongs to. */
export type DashboardRecordChange =
	| { list: 'activeOnboardings'; record: PersonnelOnboarding }
	| { list: 'ratingSchemeEntries'; record: RatingSchemeDueEntry }
	| { list: 'awardTrackingAcknowledgedPersonnelIds'; personnelId: string }
	/** Completions only the summary derives from; they take these People off the type's expired list. */
	| { list: 'trainingCompletions'; trainingTypeId: string; personnelIds: readonly string[] };

/** How a save made on the Dashboard shows up without reloading the page. */
export interface DashboardPageUpdates {
	/** Rereads the server summary in the background; the page keeps its last values until the read lands, and keeps them if it fails. */
	refreshSummary(): void;
	/** Rereads Tasking attention after a save, keeping the last rows if the read fails; settles once it has landed. */
	refreshTaskings(): Promise<void>;
	/** Reads Tasking attention again after its load failed. */
	retryTaskings(): void;
	/** Shows a record saved in the Organization in its list until the page data is next read; ignored once the page has moved to another Organization. */
	putRecord(orgId: string, change: DashboardRecordChange): void;
}

/** A change with the page's running save number, so a summary read can tell whether it started after the save. */
export interface SavedRecordChange {
	change: DashboardRecordChange;
	saveNumber: number;
}

/** Records saved on top of one workspace read; a newer read already includes them, so the overlay drops. */
export interface DashboardRecordOverlay {
	base: DashboardWorkspaceResult;
	changes: readonly SavedRecordChange[];
}

export function putDashboardRecord(
	overlay: DashboardRecordOverlay | null,
	base: DashboardWorkspaceResult,
	change: DashboardRecordChange,
	saveNumber: number
): DashboardRecordOverlay {
	return { base, changes: [...(overlay?.base === base ? overlay.changes : []), { change, saveNumber }] };
}

/** A summary read that started after a Training save already reflects it, so that save's projection retires. */
export function retireTrainingCompletions(
	overlay: DashboardRecordOverlay | null,
	readStartedAfterSave: number
): DashboardRecordOverlay | null {
	if (!overlay) return overlay;
	const changes = overlay.changes.filter(
		({ change, saveNumber }) => change.list !== 'trainingCompletions' || saveNumber > readStartedAfterSave
	);
	return changes.length === overlay.changes.length ? overlay : { ...overlay, changes };
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
	for (const { change } of overlay.changes) {
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

function withoutRecorded(
	training: NonNullable<DashboardPageSummaryData['trainingSummary']>,
	trainingTypeId: string,
	recorded: readonly string[]
): NonNullable<DashboardPageSummaryData['trainingSummary']> {
	const expiredByType = training.expiredByType.flatMap((expired) => {
		if (expired.trainingTypeId !== trainingTypeId) return [expired];
		const personnelIds = expired.personnelIds.filter((id) => !recorded.includes(id));
		return personnelIds.length > 0 ? [{ ...expired, personnelIds }] : [];
	});
	return { ...training, expiredByType };
}

/** Projects saved records onto the summary; counts the server derives wait for the refresh. */
export function overlayDashboardSummary(
	summary: DashboardPageSummaryData,
	dashboard: DashboardWorkspaceResult,
	overlay: DashboardRecordOverlay | null
): DashboardPageSummaryData {
	if (overlay?.base !== dashboard) return summary;
	const covered = new Set(summary.onboardingPersonnelIds);
	const completions = new Set(summary.onboardingTrainingCompletions);
	let trainingSummary = summary.trainingSummary;
	for (const { change } of overlay.changes) {
		if (change.list === 'trainingCompletions') {
			if (trainingSummary)
				trainingSummary = withoutRecorded(trainingSummary, change.trainingTypeId, change.personnelIds);
			continue;
		}
		if (change.list !== 'activeOnboardings' || covered.has(change.record.personnelId)) continue;
		for (const step of change.record.steps) {
			if (step.active && step.stepType === 'training' && step.trainingTypeId && step.completed)
				completions.add(`${change.record.personnelId}-${step.trainingTypeId}`);
		}
	}
	return { ...summary, trainingSummary, onboardingTrainingCompletions: [...completions] };
}
