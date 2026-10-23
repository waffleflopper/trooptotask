import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { ClientAffordance } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { z } from 'zod';
import type {
	AssignmentSource,
	Da6Segment,
	DateKey,
	Excusal,
	MonthKey,
	OpenForm,
	PoolRules,
	RosterCode,
	RosterEffect,
	RosterSlotWrite,
	StartingNumber,
	TrackId,
	WeekendMode
} from './roster/rosterTypes';

/**
 * One closed form's saved record for a month. A readable record's segment is null when nobody held the duty that
 * month. An unreadable record is reported, not thrown, so the rest of the month still shows.
 */
export type ClosedFormMonth = {
	readonly id: string;
	readonly startsOn: DateKey;
	readonly endsOn: DateKey;
} & ({ readonly readable: true; readonly segment: Da6Segment | null } | { readonly readable: false });

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
	/** Excused today, for the panel footer. */
	excused: string[];
	/** The month's days the roster details. On these days its conflicts replace the availability check. */
	covered: string[];
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
		excused: z.array(z.string()),
		covered: z.array(z.string()),
		conflicts: z.array(z.object({ date: z.string(), personId: z.string(), code: rosterCodeSchema, reason: z.string() }))
	})
) satisfies z.ZodType<PlannerRoster[]>;

/**
 * One roster on one day, for the duty picker. A detail day carries the standing going into it, highest count first
 * and ties in DA 6 order. Any other day, such as a No duty weekend, carries only the pool in DA 6 order.
 */
export type RosterDay =
	| {
			track: TrackId;
			standing: { personId: string; count: number; effect: { code: RosterCode; reason: string } | null }[];
	  }
	| { track: null; pool: string[] };

const rosterDaySchema = z.union([
	z.object({
		track: trackSchema,
		standing: z.array(
			z.object({
				personId: z.string(),
				count: z.number(),
				effect: z.object({ code: rosterCodeSchema, reason: z.string() }).nullable()
			})
		)
	}),
	z.object({ track: z.null(), pool: z.array(z.string()) })
]) satisfies z.ZodType<RosterDay>;

export const rosterDayReplySchema = rosterDaySchema.nullable();

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

/** Find replacement on one roster day. Nothing is written. */
export interface RosterReplacement {
	date: string;
	/** The assignee being replaced. `count` is their number that day, null for someone outside the pool. */
	replacing: { personId: string; count: number | null; effect: { code: RosterCode; reason: string } | null };
	/** The rule's pick, null when nobody in the pool is available. */
	nextUp: string | null;
	/** Available pool members, highest count first, with any duty they hold the day before or after. */
	candidates: { personId: string; count: number; adjacent: { name: string; day: 'before' | 'after' }[] }[];
	/** Higher counts the rule passed over, each with the code that keeps them off. */
	cantPull: { personId: string; count: number; code: RosterCode; reason: string }[];
	/** Who `repicks` and `unfilled` are for: the person asked for, candidate or not, or else the rule's pick. */
	selected: string | null;
	/** Later roster days whose pick changes when `selected` takes the day. Hand-assigned days never appear. */
	repicks: { date: string; was: string; personId: string }[];
	/** Later roster days nobody could take after the change. The replacement cannot be saved while any remain. */
	unfilled: string[];
}

export const rosterReplacementSchema = z.object({
	date: z.string(),
	replacing: z.object({
		personId: z.string(),
		count: z.number().nullable(),
		effect: z.object({ code: rosterCodeSchema, reason: z.string() }).nullable()
	}),
	nextUp: z.string().nullable(),
	candidates: z.array(
		z.object({
			personId: z.string(),
			count: z.number(),
			adjacent: z.array(z.object({ name: z.string(), day: z.enum(['before', 'after']) }))
		})
	),
	cantPull: z.array(z.object({ personId: z.string(), count: z.number(), code: rosterCodeSchema, reason: z.string() })),
	selected: z.string().nullable(),
	repicks: z.array(z.object({ date: z.string(), was: z.string(), personId: z.string() })),
	unfilled: z.array(z.string())
}) satisfies z.ZodType<RosterReplacement>;
/**
 * Where a roster's open DA 6 form stands for typed starting numbers. `editable` until a detail on the form is
 * served, then `locked`. A form that carried its numbers from the last one is `carried` and never takes typed ones.
 */
export type StartingNumbersState = 'editable' | 'locked' | 'carried';

/** The Starting numbers row in the assignment type sheet. Null for a type that keeps no open form. */
export interface StartingNumbersStatus {
	state: StartingNumbersState;
	/** True when the form holds any starting number. */
	numbered: boolean;
}

export const startingNumbersStatusSchema = z
	.object({ state: z.enum(['editable', 'locked', 'carried']), numbered: z.boolean() })
	.nullable() satisfies z.ZodType<StartingNumbersStatus | null>;

/** One typed starting number. A person without one starts at the pool's lowest number. */
export interface StartingNumberInput {
	personId: string;
	track: TrackId;
	count: number;
}

/** The whole typed set for an open form, and the roster picks after `today` that it moves. */
export interface RosterStartingNumbersWrite {
	assignmentTypeId: string;
	formId: string;
	today: string;
	numbers: readonly StartingNumberInput[];
	repicks: readonly Pick<RosterSlotWrite, 'date' | 'assigneeId' | 'was'>[];
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
	/** Closed forms that overlap `month`, oldest first, each carrying only that month's saved segment. */
	listClosedRosterForms(assignmentTypeId: string, month: MonthKey): Promise<ClosedFormMonth[]>;
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
	/**
	 * Writes roster slots as the signed-in operator, all or none. A slot whose assignee is no longer `was` fails with
	 * 409. Only slots whose source is roster become roster picks.
	 */
	writeRoster(orgId: string, slots: readonly RosterSlotWrite[]): Promise<SavedAssignment[]>;
	/**
	 * Replaces the open form's typed starting numbers and writes the re-picks as roster picks, all or none. Refused
	 * with 409 once a detail on the form is served, on carried numbers, or when a re-picked slot changed.
	 */
	setRosterStartingNumbers(orgId: string, input: RosterStartingNumbersWrite): Promise<SavedAssignment[]>;
}

export interface CalendarAvailabilityRemovalPort {
	findPersonnelIds(ids: string[]): Promise<string[]>;
	deleteIds(ids: string[]): Promise<number>;
}

export type { CalendarSupportReader } from './supportReadTypes';
export type { AssignmentSource } from './roster/rosterTypes';
