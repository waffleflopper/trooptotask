import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import { dateOnlySchema, uuidSchema } from '$lib/utils/inputSchemas';

/** The most records or IDs one availability batch request accepts; the batch RPCs enforce it too. */
export const AVAILABILITY_BATCH_LIMIT = 500;

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

export interface StatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
	/** The stored one-day label, 1-3 code points, or null to derive one from the name. */
	shortLabel: string | null;
	sortOrder: number;
}

export const NEW_STATUS_TYPE_COLORS = { color: '#4a5568', textColor: '#ffffff' } as const;

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
	showOnCalendar: boolean;
	sortOrder: number;
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
		showOnCalendar: z.boolean(),
		sortOrder: z.number(),
		archivedAt: z.string().nullable().optional()
	})
) satisfies z.ZodType<AssignmentType[]>;

export const statusTypesSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		color: z.string(),
		textColor: z.string(),
		shortLabel: z.string().nullable(),
		sortOrder: z.number()
	})
) satisfies z.ZodType<StatusType[]>;

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

export type SavedStatusType = StatusType & { organization_id?: string; created_at?: string };

export type SavedAssignmentType = AssignmentType & {
	organization_id?: string;
	created_at?: string;
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
	shortLabel?: string | null;
}

export type StatusTypePatch = Partial<StatusTypeCreate>;

export interface AssignmentTypeCreate {
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color?: string;
	exemptPersonnelIds?: string[];
}

export type AssignmentTypePatch = Partial<AssignmentTypeCreate>;

export type SpecialDayPatch = Partial<Omit<SpecialDay, 'id'>>;

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

export const AVAILABILITY_NOTE_MAX_LENGTH = 200;

const reviewedDates = { statusTypeId: uuidSchema, startDate: dateOnlySchema, endDate: dateOnlySchema };

const availabilityImportFields = {
	personnelId: uuidSchema,
	statusTypeId: uuidSchema,
	startDate: dateOnlySchema,
	endDate: dateOnlySchema,
	note: z.string().max(AVAILABILITY_NOTE_MAX_LENGTH).nullable(),
	alongside: z.array(z.object(reviewedDates)).max(AVAILABILITY_BATCH_LIMIT).optional()
};

export const availabilityImportInputSchema = z.object({
	entries: z
		.array(
			z
				.discriminatedUnion('overlap', [
					z.object({ ...availabilityImportFields, overlap: z.enum(['none', 'keep']) }),
					z.object({
						...availabilityImportFields,
						overlap: z.literal('replace'),
						replaces: z
							.array(z.object({ id: uuidSchema, ...reviewedDates }))
							.min(1)
							.max(AVAILABILITY_BATCH_LIMIT)
					})
				])
				.refine((entry) => entry.endDate >= entry.startDate, {
					message: 'End date must be on or after the start date',
					path: ['endDate']
				})
		)
		.min(1)
		.max(AVAILABILITY_BATCH_LIMIT)
		.refine(
			(entries) =>
				entries.reduce((total, entry) => total + (entry.overlap === 'replace' ? entry.replaces.length : 0), 0) <=
				AVAILABILITY_BATCH_LIMIT,
			{ message: `Replace at most ${AVAILABILITY_BATCH_LIMIT} saved entries per request` }
		)
});

export type AvailabilityImportInput = z.infer<typeof availabilityImportInputSchema>;
export type AvailabilityImportEntry = AvailabilityImportInput['entries'][number];
export type ReviewedAvailabilityEntry = Pick<AvailabilityEntry, 'id' | 'statusTypeId' | 'startDate' | 'endDate'>;
export interface AvailabilityImportWrite extends AvailabilityCreate {
	replaces: readonly ReviewedAvailabilityEntry[];
}

export interface AvailabilityImportResult {
	added: number;
	removed: number;
	errors: Array<{ index: number; message: string }>;
}

export interface CalendarCatalogPersistence {
	listStatusTypes(): Promise<SavedStatusType[]>;
	listStatusTypeLabels(): Promise<Array<{ id: string; name: string }>>;
	createStatusType(input: StatusTypeCreate): Promise<SavedStatusType>;
	/** Resolves null when no status type with this id exists in the Organization. */
	updateStatusType(id: string, patch: StatusTypePatch): Promise<SavedStatusType | null>;
	/** Resolves whether a row was removed; a missing id is not an error. */
	deleteStatusType(id: string): Promise<boolean>;
	setStatusTypeOrder(statusTypeIds: readonly string[], expectedStatusTypeIds: readonly string[]): Promise<void>;
	listAssignmentTypes(): Promise<SavedAssignmentType[]>;
	listAssignmentTypeTargets(ids: string[]): Promise<Array<{ id: string; assignTo: 'personnel' | 'group' }>>;
	createAssignmentType(input: AssignmentTypeCreate): Promise<SavedAssignmentType>;
	updateAssignmentType(id: string, patch: AssignmentTypePatch): Promise<SavedAssignmentType | null>;
	deleteAssignmentType(id: string): Promise<boolean>;
	listSpecialDays(range?: CalendarDateRange): Promise<SavedSpecialDay[]>;
	/** Adds one closure per date, skipping dates that already hold a Special Day; returns the added rows by date. */
	addClosureDays(name: string, dates: readonly string[]): Promise<SavedSpecialDay[]>;
	updateSpecialDay(id: string, patch: SpecialDayPatch): Promise<SavedSpecialDay | null>;
	deleteSpecialDay(id: string): Promise<boolean>;
	resetFederalHolidays(holidays: FederalHolidayDefault[]): Promise<SavedFederalHoliday[]>;
	setCalendarLanes(laneTypeIds: readonly string[], expectedLaneTypeIds: readonly string[]): Promise<void>;
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
	/** Skips, by index, each entry whose replaced entries changed since review; writes the rest in one transaction. */
	insertReplacing(
		entries: readonly AvailabilityImportWrite[]
	): Promise<{ inserted: number; deleted: number; stale: number[] }>;
}

export interface CalendarAssignmentReader {
	/** `assigneeIds` narrows the read to those Personnel and Groups. */
	listRange(range: CalendarDateRange & { assigneeIds?: readonly string[] }): Promise<SavedAssignment[]>;
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

/** Replaces the selected slots or complete days in one transaction; a failure keeps the existing assignments. */
export interface CalendarAssignmentReplacementPort {
	replace(orgId: string, replaceDays: string[], slots: AssignmentSlotChange[]): Promise<SavedAssignment[]>;
}

export interface CalendarAvailabilityRemovalPort {
	findPersonnelIds(ids: string[]): Promise<string[]>;
	deleteIds(ids: string[]): Promise<number>;
}

export type { CalendarSupportReader } from './supportReadTypes';
