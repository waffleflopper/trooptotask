import type { Group, RankCatalogEntry } from '$features/personnel/contracts';

/** 'YYYY-MM-DD' in the Organization's calendar. */
export type DateKey = string;
/** 'YYYY-MM'. */
export type MonthKey = string;

/** The calendar records the engine reads. Declared here because the calendar contracts import roster types. */
export interface RosterAvailability {
	readonly personnelId: string;
	readonly statusTypeId: string;
	readonly startDate: DateKey;
	readonly endDate: DateKey;
}

interface AssignmentSlot {
	readonly date: DateKey;
	readonly assignmentTypeId: string;
	readonly assigneeId: string;
}

/** Inclusive on both ends. */
export interface DateSpan {
	readonly from: DateKey;
	readonly through: DateKey;
}

export type WeekendMode = 'same' | 'separate' | 'none';

/** 'all' exists only under 'same'. 'weekend' means weekend and holiday, and exists only under 'separate'. */
export type TrackId = 'all' | 'weekday' | 'weekend';

export type RosterEffect = 'available' | 'A' | 'D' | 'U';
export type RosterCode = Exclude<RosterEffect, 'available'>;
export type AssignmentSource = 'manual' | 'roster';

/** Rules of different kinds AND together. Values within a kind OR together. An empty list leaves its kind unconstrained. */
export type PoolRules = {
	/** Inclusive range in Organization rank catalog order. The ends may come in either order. */
	readonly rank: { readonly from: string; readonly to: string } | null;
	/** Exact match, ignoring case, against `personnel.mos`. */
	readonly mos: readonly string[];
	/** Exact match, ignoring case, against `personnel.clinic_role`. */
	readonly role: readonly string[];
	readonly groupIds: readonly string[];
};

/** Fixed for the life of a form. Changing either closes the form. A null pool means Everyone. */
export interface RosterRules {
	readonly pool: PoolRules | null;
	readonly weekendMode: WeekendMode;
}

export interface Excusal {
	readonly personId: string;
	readonly reason: string;
	readonly from: DateKey;
	/** Last excused day, or null while still excused. */
	readonly through: DateKey | null;
}

/** A person's attributes from `from` until the next state. `active` is false while archived. */
export interface PersonState {
	readonly from: DateKey;
	readonly active: boolean;
	readonly rank: string;
	readonly mos: string;
	readonly clinicRole: string;
	readonly groupId: string | null;
}

export interface RosterPerson {
	readonly id: string;
	/** Current values. Rows, remarks and the tie-break use these. */
	readonly rank: string;
	readonly lastName: string;
	readonly firstName: string;
	/** Ascending by `from`. The first state starts on the day the person joined the Organization. */
	readonly states: readonly [PersonState, ...PersonState[]];
}

export interface RosterStatusType {
	readonly id: string;
	readonly name: string;
	readonly rosterEffect: RosterEffect;
}

export type RosterAssignment = AssignmentSlot & {
	readonly source: AssignmentSource;
};

export interface SwapDay {
	readonly date: DateKey;
	/** Held the day when the swap was entered, and stays counted for it. */
	readonly heldBy: string;
}

/** Two days of one roster traded between their holders. Earlier day first. */
export interface RosterSwap {
	readonly id: string;
	readonly days: readonly [SwapDay, SwapDay];
}

export interface StartingNumber {
	readonly personId: string;
	readonly track: TrackId;
	readonly count: number;
	readonly origin: 'typed' | 'carried';
}

export interface OpenForm {
	readonly kind: 'open';
	readonly id: string;
	readonly startsOn: DateKey;
	readonly rules: RosterRules;
	/** Applied at each person's first entry on this form, on that track. */
	readonly startingNumbers: readonly StartingNumber[];
}

export interface ClosedForm {
	readonly kind: 'closed';
	readonly id: string;
	readonly startsOn: DateKey;
	readonly endsOn: DateKey;
	readonly rules: RosterRules;
	/** As saved at close. Never recalculated. */
	readonly segments: readonly Da6Segment[];
}

export type RosterForm = OpenForm | ClosedForm;

/** Per-track counts after `after`. The close carry reads it. */
export interface RosterCheckpoint {
	readonly formId: string;
	readonly after: DateKey;
	readonly entries: readonly {
		readonly personId: string;
		readonly track: TrackId;
		readonly count: number;
		/** false when the person has left the pool and the count is frozen. */
		readonly onRoster: boolean;
	}[];
}

/**
 * Everything one roster's open form needs. Completeness contract:
 * - This type's `assignments`, A-effect `availability`, and `holidays` cover `form.startsOn` through `window.through`.
 * - `swaps` includes each swap with either day from `form.startsOn` through `window.through`.
 * - Other types' `assignments` and D or U `availability` cover `window` plus one day each side.
 * - Availability and other-roster effects cover everyone in `people`, including assignees outside the pool.
 * Counts are exact under this contract because D and U never move a count.
 */
export interface RosterFacts {
	/** Decides served versus planned. The engine never reads the clock. */
	readonly today: DateKey;
	/** Days that get records. Fill and re-pick act only inside it. */
	readonly window: DateSpan;
	readonly type: { readonly id: string; readonly name: string };
	readonly form: OpenForm;
	/** Every person in the Organization, archived included. */
	readonly people: readonly RosterPerson[];
	readonly excusals: readonly Excusal[];
	readonly swaps: readonly RosterSwap[];
	readonly groups: readonly Group[];
	/** The Organization's catalog. Ties and rank ranges read only this. */
	readonly rankCatalog: readonly RankCatalogEntry[];
	readonly statusTypes: readonly RosterStatusType[];
	readonly availability: readonly RosterAvailability[];
	/** Special Days. Each counts as a weekend-and-holiday date. */
	readonly holidays: readonly DateKey[];
	/** This type and other person-assigned types. */
	readonly assignments: readonly RosterAssignment[];
	/** Names of other types, used as the reason for their D. */
	readonly assignmentTypeNames: ReadonlyMap<string, string>;
}

export type PickPlan =
	| { readonly kind: 'stored' }
	/** Open days in `days` get the rule's pick. Assigned days stay. Must lie inside `window`. */
	| { readonly kind: 'fill'; readonly days: DateSpan }
	/** Roster-sourced days inside `window` after max(`after`, today) get the rule's pick. Manual and served days stay. */
	| { readonly kind: 'repick'; readonly after: DateKey };

export type Effect = { readonly code: 'available' } | { readonly code: RosterCode; readonly reason: string };

export interface Standing {
	readonly personId: string;
	/** The DA 6 number that day: after the increment, before the reset. A holds. */
	readonly count: number;
	readonly effect: Effect;
}

export interface CurrentCount {
	readonly personId: string;
	readonly count: number;
	readonly effect: Effect;
}

export interface TrackCounts {
	readonly track: TrackId;
	readonly counts: readonly CurrentCount[];
}

export type DayDetail =
	| {
			readonly kind: 'stored';
			readonly personId: string;
			readonly source: AssignmentSource;
			/** The original holder counted for a swapped day, otherwise null. */
			readonly heldBy: string | null;
			readonly served: boolean;
			/** Whether the counted person is on the roster and resets. */
			readonly onRoster: boolean;
			/** Resolved for the actual assignee, including someone outside the pool. */
			readonly effect: Effect;
	  }
	| { readonly kind: 'planned'; readonly personId: string; readonly was: string | null };

export interface RosterDay {
	readonly date: DateKey;
	readonly track: TrackId;
	/** null on an open day. An open day moves no count, so its standing is what the day would show. */
	readonly detail: DayDetail | null;
	/** Pool members that day, highest count first, ties in DA 6 order. */
	readonly standing: readonly Standing[];
	/** The rule's pick, whoever is actually assigned. null when nobody is available. */
	readonly rulePick: string | null;
}

export interface PlannedChange {
	readonly date: DateKey;
	readonly track: TrackId;
	readonly personId: string;
	readonly count: number;
	/** The assignee this change replaces, so a batch can check the slot did not change underneath it. */
	readonly was: string | null;
	readonly passedOver: readonly Standing[];
	/** Status type name when the person was A on the previous detail day of this track. */
	readonly returningFrom: string | null;
}

export type EntryCause = 'form-start' | 'joined' | 'matched' | 'reinstated' | 'reactivated';
export type LeaveCause = 'excused' | 'archived' | 'unmatched';

export type PoolChange =
	| { readonly date: DateKey; readonly personId: string; readonly kind: 'enter'; readonly cause: EntryCause }
	| { readonly date: DateKey; readonly personId: string; readonly kind: 'leave'; readonly cause: LeaveCause };

export interface RosterRun {
	readonly facts: RosterFacts;
	/** Includes people outside the pool. Uses the same effect precedence as standing. */
	readonly effectOn: (personId: string, date: DateKey) => Effect;
	/** Detail dates inside the window, ascending. Each date belongs to at most one track. */
	readonly days: readonly RosterDay[];
	readonly byDate: ReadonlyMap<DateKey, RosterDay>;
	/** Counts after the last detail on or before today, with today's effects. Null when today is outside the window. */
	readonly current: readonly TrackCounts[] | null;
	/** Pool entries and departures over the whole form, including before the window. */
	readonly poolChanges: readonly PoolChange[];
	/** Empty for the stored plan. */
	readonly changes: readonly PlannedChange[];
	/**
	 * Days the plan had to decide but nobody could take. Fill leaves them open and still fills later days.
	 * A re-pick keeps the old assignee in the simulation, so callers must block its commit while this is non-empty.
	 */
	readonly unfilled: readonly DateKey[];
	/** Stored assignments on weekend or holiday dates under 'none'. They stay facts but move no count. */
	readonly excludedDates: readonly DateKey[];
	readonly end: RosterCheckpoint;
}

export interface PersonRef {
	readonly personId: string;
	readonly rank: string;
	readonly lastName: string;
	readonly firstName: string;
}

export type Da6Cell =
	| null
	| { readonly kind: 'count'; readonly count: number }
	| { readonly kind: 'away'; readonly count: number; readonly reason: string }
	| { readonly kind: 'code'; readonly code: 'D' | 'U'; readonly count: number; readonly reason: string }
	| { readonly kind: 'detail'; readonly count: number; readonly when: 'served' | 'planned' };

export interface Da6PassedOver extends PersonRef {
	readonly count: number;
	readonly code: RosterCode;
	readonly reason: string;
}

export interface Da6Column {
	readonly date: DateKey;
	readonly track: TrackId;
	readonly when: 'served' | 'planned';
	readonly pick: PersonRef;
	/** The original holder counted for a swapped day, otherwise null. */
	readonly heldBy: PersonRef | null;
	readonly source: AssignmentSource;
	/** For "Show the work". Empty when the rule's pick led the standing. */
	readonly passedOver: readonly Da6PassedOver[];
	/** Set when the day went to someone other than the rule's pick. */
	readonly rulePick: PersonRef | null;
}

export type Da6Remark =
	| {
			readonly kind: 'excused';
			readonly who: PersonRef;
			readonly reason: string;
			readonly from: DateKey;
			readonly through: DateKey | null;
	  }
	| { readonly kind: 'left'; readonly who: PersonRef; readonly on: DateKey; readonly cause: 'archived' | 'unmatched' }
	| {
			readonly kind: 'joined';
			readonly who: PersonRef;
			readonly on: DateKey;
			readonly cause: 'joined' | 'matched' | 'reactivated';
	  }
	| {
			readonly kind: 'swapped';
			readonly who: PersonRef;
			readonly on: DateKey;
			readonly with: PersonRef;
			readonly other: DateKey;
	  }
	| { readonly kind: 'outside'; readonly who: PersonRef; readonly date: DateKey };

/** One form's part of one month. Self-contained, so a closed form renders with no live lookup. */
export interface Da6Segment {
	readonly formId: string;
	readonly formState: 'open' | 'closed';
	readonly natureOfDuty: string;
	readonly month: MonthKey;
	readonly weekendMode: WeekendMode;
	readonly columns: readonly Da6Column[];
	/** Members at the month boundary in DA 6 order, then entrants by entry date. Departures stay through that month. */
	readonly rows: readonly PersonRef[];
	/** cells[row][column]. */
	readonly cells: readonly (readonly Da6Cell[])[];
	readonly remarks: readonly Da6Remark[];
}

export interface ReplacementCandidate extends Standing {
	/** Duties this person holds the day before or after. */
	readonly adjacent: readonly { readonly name: string; readonly day: 'before' | 'after' }[];
}

export interface ReplacementOptions {
	readonly day: RosterDay;
	readonly nextUp: string | null;
	readonly candidates: readonly ReplacementCandidate[];
	readonly cantPull: readonly Standing[];
}

export interface CountChange {
	readonly date: DateKey;
	readonly personId: string;
	readonly track: TrackId;
	readonly from: Da6Cell;
	readonly to: Da6Cell;
}

/** One slot a roster write sets. `was` is the assignee the plan saw there, null for an open day. */
export type RosterSlotWrite = AssignmentSlot & { readonly was: string | null; readonly source: AssignmentSource };

export type RosterSlotChange = RosterSlotWrite & { readonly source: 'roster' };
