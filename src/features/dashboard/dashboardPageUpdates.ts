import type { PersonnelOnboarding } from '$features/onboarding/contracts';
import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
import { isDueSoon, type TrainingStatus } from '$features/training';
import type { DashboardPageSummaryData, DashboardWorkspaceResult } from './contracts';

/** A record the viewer just saved, for the list in the static page data it belongs to. */
export type DashboardRecordChange =
	| { list: 'activeOnboardings'; record: PersonnelOnboarding }
	| { list: 'ratingSchemeEntries'; record: RatingSchemeDueEntry }
	| { list: 'awardTrackingAcknowledgedPersonnelIds'; personnelId: string }
	/** Completions only the summary derives from, with the status each saved record now gives its Person. */
	| { list: 'trainingCompletions'; trainingTypeId: string; saved: readonly SavedTrainingStatus[] };

export interface SavedTrainingStatus {
	personnelId: string;
	status: TrainingStatus;
}

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

/** A saved Person leaves a list only when their new record no longer puts them on it, such as a backdated date. */
function withoutRecorded(
	training: NonNullable<DashboardPageSummaryData['trainingSummary']>,
	trainingTypeId: string,
	saved: readonly SavedTrainingStatus[]
): NonNullable<DashboardPageSummaryData['trainingSummary']> {
	const statusOf = new Map(saved.map(({ personnelId, status }) => [personnelId, status]));
	const stays = (personnelId: string, onList: (status: TrainingStatus) => boolean) => {
		const status = statusOf.get(personnelId);
		return status === undefined || onList(status);
	};
	const expiredByType = training.expiredByType.flatMap((expired) => {
		if (expired.trainingTypeId !== trainingTypeId) return [expired];
		const personnelIds = expired.personnelIds.filter((id) => stays(id, (status) => status === 'expired'));
		return personnelIds.length > 0 ? [{ ...expired, personnelIds }] : [];
	});
	const dueSoonByType = training.dueSoonByType.flatMap((due) => {
		if (due.trainingTypeId !== trainingTypeId) return [due];
		const people = due.people.filter(({ personnelId }) => stays(personnelId, isDueSoon));
		return people.length > 0 ? [{ ...due, people }] : [];
	});
	return { ...training, expiredByType, dueSoonByType };
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
			if (trainingSummary) trainingSummary = withoutRecorded(trainingSummary, change.trainingTypeId, change.saved);
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
