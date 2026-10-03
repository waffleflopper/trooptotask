/** Calendar facts shared with its web and server consumers. */

export interface StatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
}

export interface AvailabilityEntry {
	id: string;
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export interface SpecialDay {
	id: string;
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
}

export interface AssignmentType {
	id: string;
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color: string;
	textColor?: string;
	exemptPersonnelIds: string[];
	showInDateHeader: boolean;
	archivedAt?: string | null;
}

export interface DailyAssignment {
	id: string;
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export interface AssignmentSlotChange {
	date: string;
	assignmentTypeId: string;
	assigneeId: string;
}

export type SavedAssignment = DailyAssignment & { organization_id?: string; created_at?: string };

/** One committed replacement of selected slots or complete days. */
export interface CalendarAssignmentReplacementPort {
	replace(orgId: string, replaceDays: string[], slots: AssignmentSlotChange[]): Promise<SavedAssignment[]>;
}

export type { CalendarSupportReader } from './supportReadTypes';
