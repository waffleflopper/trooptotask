import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';

export type DutyRosterRunDuration = 'daily' | 'weekly' | 'monthly';
export type DutyRosterNumberingMode = 'single-sequence' | 'separate-weekend-holiday';
export type DutyRosterSequenceKind = 'weekday' | 'weekend' | 'holiday' | 'weekend-holiday';

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
	advancedDutyEvents: DutyEvent[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
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
	specialDayIds: string[];
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
	reasonCode: string | null;
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
	rosterRows: DutyRosterRow[];
	da6: Da6Matrix;
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
