import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import type {
	AssignmentSource,
	Da6Segment,
	Excusal,
	OpenForm,
	PoolRules,
	RosterCode,
	RosterEffect,
	RosterSlotChange,
	StartingNumber,
	TrackId,
	WeekendMode
} from './roster/rosterTypes';

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
	/** What this status does to a person's place on a duty roster. */
	rosterEffect: RosterEffect;
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

export const rosterEffectSchema = z.enum(['available', 'A', 'D', 'U']) satisfies z.ZodType<RosterEffect>;
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
		rosterEffect: rosterEffectSchema,
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
	rosterEffect?: RosterEffect;
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

/** One person's change on one roster's open DA 6 form that a status effect change would cause. */
export interface StatusEffectChange {
	assignmentTypeId: string;
	/** The roster's name, as in "on the CQ DA 6". */
	rosterName: string;
	/** True when the roster keeps a separate weekend and holiday count, so the line names its track. */
	track: TrackId;
	personId: string;
	/** "SGT Kim". */
	person: string;
	/** `earlier` when every changed day is before today. `days` when today or a planned day also changes. */
	change: { kind: 'number'; from: number; to: number } | { kind: 'earlier' | 'days'; days: number };
}

export const statusEffectChangesSchema = z.array(
	z.object({
		assignmentTypeId: z.string(),
		rosterName: z.string(),
		track: z.enum(['all', 'weekday', 'weekend']),
		personId: z.string(),
		person: z.string(),
		change: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('number'), from: z.number(), to: z.number() }),
			z.object({ kind: z.enum(['earlier', 'days']), days: z.number() })
		])
	})
) satisfies z.ZodType<StatusEffectChange[]>;

const trackSchema = z.enum(['all', 'weekday', 'weekend']);
const rosterCodeSchema = z.enum(['A', 'D', 'U']);

/**
 * One roster in the Duty planner. Standings are flat runs of [person, count, effect] that index `people`,
 * with effect 0 for available and n for `effects[n - 1]`, highest count first and ties in DA 6 order.
 */
export interface PlannerRoster {
	typeId: string;
	people: string[];
	effects: { code: RosterCode; reason: string }[];
	/** Counts after the last detail on or before today, per track. Null when today is outside the open form. */
	current: { track: TrackId; standing: number[] }[] | null;
	todayAssignee: string | null;
	/** Each day of the month the roster can detail, with the standing going into it. */
	days: { date: string; track: TrackId; standing: number[] }[];
	/** Excused today, for the panel footer. */
	excused: string[];
	/** Days in the month whose assignee has A, D or U, including assignees outside the pool. */
	conflicts: { date: string; personId: string; code: RosterCode; reason: string }[];
}

export const plannerRostersSchema = z.array(
	z.object({
		typeId: z.string(),
		people: z.array(z.string()),
		effects: z.array(z.object({ code: rosterCodeSchema, reason: z.string() })),
		current: z.array(z.object({ track: trackSchema, standing: z.array(z.number()) })).nullable(),
		todayAssignee: z.string().nullable(),
		days: z.array(z.object({ date: z.string(), track: trackSchema, standing: z.array(z.number()) })),
		excused: z.array(z.string()),
		conflicts: z.array(z.object({ date: z.string(), personId: z.string(), code: rosterCodeSchema, reason: z.string() }))
	})
) satisfies z.ZodType<PlannerRoster[]>;

export interface RosterFillPick {
	date: string;
	personId: string;
	count: number;
	/** Higher counts the rule passed over, each with the code that kept them off. */
	passedOver: { personId: string; count: number; code: RosterCode; reason: string }[];
	/** The status the pick was away on at their last detail on this track, as in "back from TDY". */
	returningFrom: string | null;
}

/** The engine's fill plan for open days. Nobody could take an unfilled day; the fill leaves it open. */
export interface RosterFillPreview {
	picks: RosterFillPick[];
	unfilled: string[];
}

export const rosterFillPreviewSchema = z.object({
	picks: z.array(
		z.object({
			date: z.string(),
			personId: z.string(),
			count: z.number(),
			passedOver: z.array(
				z.object({ personId: z.string(), count: z.number(), code: rosterCodeSchema, reason: z.string() })
			),
			returningFrom: z.string().nullable()
		})
	),
	unfilled: z.array(z.string())
}) satisfies z.ZodType<RosterFillPreview>;

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
	/**
	 * Closes the open form on `today` with this record, or removes it when it starts after `today` (a null record),
	 * and makes the type a Group assignment, which keeps no form.
	 */
	endRosterForm(input: Omit<RosterFormClose, 'poolRules' | 'weekendMode' | 'carry'>): Promise<void>;
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
	/**
	 * Every duty day of this type from `from` through `through`, including days whose assignee was deleted, which
	 * `listRange` leaves out. Days of people outside the reader's Calendar scope stay hidden.
	 */
	listRosterDetailDays(
		assignmentTypeId: string,
		span: { from: string; through: string }
	): Promise<Array<{ date: string; assigneeId: string; source: AssignmentSource }>>;
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
	/** Writes roster picks into open slots as the signed-in operator, all or none. An occupied slot fails with 409. */
	fillRoster(orgId: string, slots: readonly RosterSlotChange[]): Promise<SavedAssignment[]>;
}

export interface CalendarAvailabilityRemovalPort {
	findPersonnelIds(ids: string[]): Promise<string[]>;
	deleteIds(ids: string[]): Promise<number>;
}

export type { CalendarSupportReader } from './supportReadTypes';
export type { AssignmentSource } from './roster/rosterTypes';
