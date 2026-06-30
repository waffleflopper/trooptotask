import type { DutyEvent, DutyEventSeriesPattern } from '$features/duty-roster/duty-roster.types';
import type { RankCatalogEntry } from '$lib/domain/rankCatalog';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { Da6ReasonCode, Da6ReasonParams } from './da6ReasonText';

export type DutyRosterRunDuration = 'daily' | 'weekly' | 'monthly';
export type DutyRosterNumberingMode = 'single-sequence' | 'separate-weekend-holiday';
export type DutyRosterSequenceKind = 'weekday' | 'weekend' | 'holiday' | 'weekend-holiday';
export type DutyRosterSequenceKey = 'single' | 'weekday' | 'weekend-holiday';

export type Da6CellCode =
	| 'assigned'
	| 'available-not-selected'
	| 'authorized-absence'
	| 'blocked-by-duty'
	| 'blocked-by-cooldown'
	| 'misconduct-unavailable';

export interface DutyRosterRunConfig {
	startDate: string;
	endDate: string;
	dutyDuration: DutyRosterRunDuration;
	pattern?: DutyEventSeriesPattern;
	selectedWeekdays?: number[];
	excludedStatusIds: string[];
	excludeWeekends: boolean;
	excludeHolidays: boolean;
	excludeOrgClosures: boolean;
	exemptPersonnelIds?: string[];
	numberingMode?: DutyRosterNumberingMode;
	misconductUnavailablePersonnelDates?: Record<string, string[]>;
}

export interface DutyRosterRunInput {
	assignmentType: AssignmentType;
	personnel: Personnel[];
	assignments: DailyAssignment[];
	rosterHistory?: DutyRosterContinuationHistoryItem[];
	advancedDutyEvents: DutyEvent[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	rankCatalog?: readonly RankCatalogEntry[];
	config: DutyRosterRunConfig;
	generatedAt?: string;
}

export interface DutyRosterSnapshotPersonnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupId: string | null;
	groupName: string;
}

export interface DutyRosterRunAssignmentTypeSnapshot {
	id: string;
	name: string;
	shortName: string;
	color: string;
}

export interface DutyRosterRow {
	date: string;
	assigneeId: string | null;
	reason?: string;
}

export interface Da6Column {
	date: string;
	sequenceKind: DutyRosterSequenceKind;
	sequenceKey: DutyRosterSequenceKey;
	specialDayIds: string[];
	chargeSequenceStart: number | null;
	chargeableCount: number;
}

export interface Da6Cell {
	date: string;
	personnelId: string;
	code: Da6CellCode;
	da6Code: 'A' | 'D' | 'U' | null;
	chargeable: boolean;
	queuePosition: number | null;
	sequenceNumber: number | null;
	assigned: boolean;
	reason: string | null;
	reasonCode: Da6ReasonCode | null;
	reasonParams?: Da6ReasonParams;
}

export interface Da6Row {
	personnelId: string;
	display: DutyRosterSnapshotPersonnel;
	cells: Da6Cell[];
}

export interface Da6Matrix {
	numberingMode: DutyRosterNumberingMode;
	columns: Da6Column[];
	rows: Da6Row[];
}

export interface DutyRosterExportModel {
	assignmentType: DutyRosterRunAssignmentTypeSnapshot;
	startDate: string;
	endDate: string;
	numberingMode: DutyRosterNumberingMode;
	rosterRows: DutyRosterRow[];
	da6: Da6Matrix;
	sequencePeriods: DutyRosterExportSequencePeriod[];
}

export interface DutyRosterExportSequencePeriod {
	date: string;
	sequenceKind: DutyRosterSequenceKind;
	sequenceKey: DutyRosterSequenceKey;
	isWeekendOrHoliday: boolean;
	specialDayIds: string[];
}

export interface DutyRosterApplyPayloadRow {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export interface DutyRosterHistoryEntry {
	date: string;
	assigneeId: string | null;
	assigneeName: string | null;
	assigneeRank: string | null;
	assigneeGroup: string | null;
	reason?: string;
}

export interface DutyRosterHistoryDa6Data {
	personnel: { id: string; name: string; rank: string; group: string }[];
	dates: { date: string; positions: (number | null)[]; assigned: boolean[] }[];
}

export interface DutyRosterHistoryPayload {
	assignmentTypeId: string;
	name: string;
	startDate: string;
	endDate: string;
	roster: DutyRosterHistoryEntry[];
	da6?: DutyRosterHistoryDa6Data;
	config: Record<string, unknown>;
}

export interface DutyRosterContinuationHistoryItem {
	assignmentTypeId: string;
	startDate: string;
	endDate: string;
	roster: DutyRosterHistoryEntry[];
	config: Record<string, unknown>;
}

export interface DutyRosterRunSnapshot {
	generatedAt: string;
	assignmentType: DutyRosterRunAssignmentTypeSnapshot;
	config: Required<Omit<DutyRosterRunConfig, 'misconductUnavailablePersonnelDates'>> & {
		misconductUnavailablePersonnelDates: Record<string, string[]>;
	};
	personnel: DutyRosterSnapshotPersonnel[];
	rosterRows: DutyRosterRow[];
	da6: Da6Matrix;
	exportModel: DutyRosterExportModel;
	warnings: string[];
}
