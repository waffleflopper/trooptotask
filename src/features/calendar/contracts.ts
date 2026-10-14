import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { z } from 'zod';

/** Live advisory facts supplied by Delivery for Calendar operations. */
export interface CalendarOperationsPageAccess {
	readonly orgUrlSegment: string;
	readonly scopeSet: ScopeSet;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => Pick<ClientAffordance, 'allowed'>;
}

export interface CalendarSettingsPageAccess {
	readonly orgUrlSegment: string;
	readonly affordanceForFeatureAction: (
		action: FeatureLanePolicyAction,
		resource?: PolicyResource
	) => Pick<ClientAffordance, 'allowed' | 'visible'>;
}

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

export const assignmentTypesSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		shortName: z.string(),
		assignTo: z.enum(['personnel', 'group']),
		color: z.string(),
		textColor: z.string().optional(),
		exemptPersonnelIds: z.array(z.string()),
		showInDateHeader: z.boolean(),
		archivedAt: z.string().nullable().optional()
	})
) satisfies z.ZodType<AssignmentType[]>;

export const specialDaysSchema = z.array(
	z.object({
		id: z.string(),
		date: z.string(),
		name: z.string(),
		type: z.enum(['federal-holiday', 'org-closure'])
	})
) satisfies z.ZodType<SpecialDay[]>;

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

export type SavedStatusType = StatusType & {
	organization_id?: string;
	created_at?: string;
	sortOrder?: number | null;
};

export type SavedAssignmentType = AssignmentType & {
	organization_id?: string;
	created_at?: string;
	sortOrder?: number | null;
};

export type SavedSpecialDay = SpecialDay & { organization_id?: string; created_at?: string };
export type SavedFederalHoliday = SavedSpecialDay & { type: 'federal-holiday' };
export type SavedAvailabilityEntry = AvailabilityEntry & { organization_id?: string; created_at?: string };

export interface CalendarDateRange {
	rangeStart: string;
	rangeEnd: string;
}

export interface StatusTypeCreate {
	name: string;
	color?: string;
	textColor?: string;
	sortOrder?: number;
}

export type StatusTypePatch = Partial<StatusTypeCreate>;

export interface AssignmentTypeCreate {
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color?: string;
	sortOrder?: number;
	exemptPersonnelIds?: string[];
}

export type AssignmentTypePatch = Partial<AssignmentTypeCreate>;

export interface SpecialDayCreate {
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
}

export type SpecialDayPatch = Partial<SpecialDayCreate>;

export interface FederalHolidayDefault {
	date: string;
	name: string;
}

export interface AvailabilityCreate {
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export type AvailabilityPatch = Partial<Omit<AvailabilityCreate, 'personnelId'>>;

export interface CalendarCatalogPersistence {
	listStatusTypes(): Promise<SavedStatusType[]>;
	listStatusTypeLabels(): Promise<Array<{ id: string; name: string }>>;
	createStatusType(input: StatusTypeCreate): Promise<SavedStatusType>;
	updateStatusType(id: string, patch: StatusTypePatch): Promise<SavedStatusType>;
	deleteStatusType(id: string): Promise<void>;
	listAssignmentTypes(): Promise<SavedAssignmentType[]>;
	listAssignmentTypeTargets(ids: string[]): Promise<Array<{ id: string; assignTo: 'personnel' | 'group' }>>;
	createAssignmentType(input: AssignmentTypeCreate): Promise<SavedAssignmentType>;
	updateAssignmentType(id: string, patch: AssignmentTypePatch): Promise<SavedAssignmentType>;
	deleteAssignmentType(id: string): Promise<void>;
	listSpecialDays(range?: CalendarDateRange): Promise<SavedSpecialDay[]>;
	createSpecialDay(input: SpecialDayCreate): Promise<SavedSpecialDay>;
	updateSpecialDay(id: string, patch: SpecialDayPatch): Promise<SavedSpecialDay>;
	deleteSpecialDay(id: string): Promise<void>;
	resetFederalHolidays(holidays: FederalHolidayDefault[]): Promise<SavedFederalHoliday[]>;
	setDateHeader(assignmentTypeId: string): Promise<void>;
}

export interface CalendarAvailabilityPersistence extends CalendarAvailabilityRemovalPort {
	listOverlapping(
		input: CalendarDateRange & { personnelId?: string; personnelIds?: string[]; orderByEndDate?: boolean }
	): Promise<SavedAvailabilityEntry[]>;
	listPersonnelHistory(personnelId: string): Promise<SavedAvailabilityEntry[]>;
	findReference(id: string): Promise<{ personnelId: string } | null>;
	create(input: AvailabilityCreate): Promise<SavedAvailabilityEntry>;
	update(id: string, patch: AvailabilityPatch): Promise<SavedAvailabilityEntry>;
	delete(id: string): Promise<void>;
	createMany(inputs: AvailabilityCreate[]): Promise<SavedAvailabilityEntry[]>;
}

export interface CalendarAssignmentReader {
	listRange(range: CalendarDateRange): Promise<SavedAssignment[]>;
	listDayReferences(
		date: string,
		assignmentTypeId?: string
	): Promise<
		Array<{
			assignmentTypeId: string;
			assigneeId: string;
		}>
	>;
	listSlotReferences(slots: Array<{ date: string; assignmentTypeId: string }>): Promise<
		Array<{
			date: string;
			assignmentTypeId: string;
			assigneeId: string;
		}>
	>;
}

/** One committed replacement of selected slots or complete days. */
export interface CalendarAssignmentReplacementPort {
	replace(orgId: string, replaceDays: string[], slots: AssignmentSlotChange[]): Promise<SavedAssignment[]>;
}

export interface CalendarAvailabilityRemovalPort {
	findPersonnelIds(ids: string[]): Promise<string[]>;
	deleteIds(ids: string[]): Promise<number>;
}

export type { CalendarSupportReader } from './supportReadTypes';
