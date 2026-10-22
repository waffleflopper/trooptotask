import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import type { Da6Segment, Excusal, OpenForm, PoolRules, StartingNumber, WeekendMode } from './roster/rosterTypes';

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

/** Someone kept off one duty roster from `startsOn` until they are reinstated. */
export interface RosterExcusal {
	personId: string;
	reason: string;
	startsOn: string;
}

export interface AssignmentType {
	id: string;
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color: string;
	textColor?: string;
	/** Null means Everyone. Only person-assigned types are rosters. */
	poolRules: PoolRules | null;
	weekendMode: WeekendMode;
	/** Current excusals only. Reinstated people are back in the pool. */
	excusals: RosterExcusal[];
	showOnCalendar: boolean;
	sortOrder: number;
	archivedAt?: string | null;
}

export const ROSTER_EXCUSAL_REASON_MAX = 120;

export const poolRulesSchema = z.object({
	rank: z.object({ from: z.string().min(1), to: z.string().min(1) }).nullable(),
	mos: z.array(z.string()),
	role: z.array(z.string()),
	groupIds: z.array(z.string())
}) satisfies z.ZodType<PoolRules>;

export const weekendModeSchema = z.enum(['same', 'separate', 'none']) satisfies z.ZodType<WeekendMode>;

/** One spelling per rule set, so equal rules compare equal and a rule set with nothing in it means Everyone. */
export function normalizePoolRules(rules: PoolRules): PoolRules | null {
	const distinct = (values: readonly string[]) => [...new Set(values.map((value) => value.trim()))].sort();
	// Saved rules come back from jsonb with its own key order, so every key is rebuilt in one order.
	const normalized = {
		rank: rules.rank && { from: rules.rank.from.trim(), to: rules.rank.to.trim() },
		mos: distinct(rules.mos),
		role: distinct(rules.role),
		groupIds: distinct(rules.groupIds)
	};
	const empty = !normalized.rank && !normalized.mos.length && !normalized.role.length && !normalized.groupIds.length;
	return empty ? null : normalized;
}

export const assignmentTypesSchema = z.array(
	z.object({
		id: z.string(),
		name: z.string(),
		shortName: z.string(),
		assignTo: z.enum(['personnel', 'group']),
		color: z.string(),
		textColor: z.string().optional(),
		poolRules: poolRulesSchema.nullable(),
		weekendMode: weekendModeSchema,
		excusals: z.array(z.object({ personId: z.string(), reason: z.string(), startsOn: z.string() })),
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

export interface AssignmentTypeDetails {
	name: string;
	shortName: string;
	assignTo: 'personnel' | 'group';
	color?: string;
}

/** A new type opens its first DA 6 form under these rules. */
export interface AssignmentTypeCreate extends AssignmentTypeDetails {
	poolRules?: PoolRules | null;
	weekendMode?: WeekendMode;
}

export type AssignmentTypePatch = Partial<AssignmentTypeDetails>;

export interface RosterExcusalInput {
	personId: string;
	reason: string;
}

/** The roster settings an editor wants. Changed rules close the open DA 6 form on `today`. */
export interface RosterSettingsInput {
	poolRules: PoolRules | null;
	weekendMode: WeekendMode;
	excusals: RosterExcusalInput[];
	/** The editor's calendar day. */
	today: string;
}

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
	/** Null for a group-assigned type, or a person-assigned type whose form a concurrent save is replacing. */
	findOpenRosterForm(assignmentTypeId: string): Promise<OpenForm | null>;
	/** Every excusal on this roster, reinstated ones included, so a close can save who was excused when. */
	listRosterExcusals(assignmentTypeId: string): Promise<Excusal[]>;
	/** Makes `excusals` the open set from `today` on, ending the others yesterday. */
	setRosterExcusals(assignmentTypeId: string, today: string, excusals: readonly RosterExcusalInput[]): Promise<void>;
	/**
	 * Sets the type's rules and returns the open form's id. A null record rewrites a form that starts after
	 * `today` in place. Otherwise the open form closes on `today` with this record and the next opens on `today + 1`.
	 */
	closeRosterForm(input: RosterFormClose): Promise<string>;
}

export interface RosterFormClose {
	assignmentTypeId: string;
	formId: string;
	today: string;
	poolRules: PoolRules | null;
	weekendMode: WeekendMode;
	record: { segments: readonly Da6Segment[] } | null;
	carry: readonly StartingNumber[];
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
