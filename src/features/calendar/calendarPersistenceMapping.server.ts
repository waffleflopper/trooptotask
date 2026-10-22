import { z } from 'zod';
import { dateOnlySchema, isUuid, uuidSchema } from '$lib/utils/inputSchemas';
import type {
	ClosedFormMonth,
	RosterExcusal,
	SavedAssignment,
	SavedAssignmentType,
	SavedAvailabilityEntry,
	SavedSpecialDay,
	SavedStatusType
} from './contracts';
import { fitsOneDayLabel, normalizeShortLabel } from '$lib/components/patterns/calendar-bars';
import { MAX_CLOSURE_DAYS } from './utils/closureDays';
import type {
	Da6Segment,
	MonthKey,
	OpenForm,
	PoolRules,
	RosterEffect,
	TrackId,
	WeekendMode
} from './roster/rosterTypes';
import {
	ROSTER_EXCUSAL_REASON_MAX,
	normalizePoolRules,
	poolRulesSchema,
	rosterEffectSchema,
	weekendModeSchema
} from './contracts';

type SavedRow = { organization_id?: string; created_at?: string };

export type StatusTypeRow = SavedRow & {
	id: string;
	name: string;
	color: string;
	text_color: string;
	short_label: string | null;
	roster_effect: RosterEffect;
	sort_order: number;
};
export type AssignmentTypeRow = SavedRow & {
	id: string;
	name: string;
	short_name: string;
	assign_to: 'personnel' | 'group';
	color: string;
	sort_order: number;
	show_on_calendar: boolean;
	roster_pool_rules: PoolRules | null;
	roster_weekend_mode: WeekendMode;
	/** Nested through the roster_excusals relation. The mapping keeps the open ones. */
	roster_excusals?: RosterExcusalRow[] | null;
	archived_at?: string | null;
};
export type RosterFormRow = {
	id: string;
	starts_on: string;
	rules: { pool: PoolRules | null; weekendMode: WeekendMode };
	roster_starting_numbers: Array<{
		personnel_id: string;
		track: TrackId;
		count: number;
		origin: 'typed' | 'carried';
	}> | null;
};
export type ClosedRosterFormRow = {
	id: string;
	starts_on: string;
	ends_on: string;
	record: unknown;
};
export type RosterExcusalRow = { personnel_id: string; reason: string; starts_on: string; ends_on?: string | null };
export type SpecialDayRow = SavedRow & {
	id: string;
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
};
export type AvailabilityRow = SavedRow & {
	id: string;
	personnel_id: string;
	status_type_id: string;
	start_date: string;
	end_date: string;
	note?: string | null;
};
export type AssignmentRow = SavedRow & {
	id: string;
	date: string;
	assignment_type_id: string;
	assignee_id: string;
};

export const STATUS_TYPE_FIELDS =
	'id, organization_id, name, color, text_color, short_label, roster_effect, sort_order, created_at';
export const ASSIGNMENT_TYPE_FIELDS =
	'id, organization_id, name, short_name, assign_to, color, sort_order, show_on_calendar, roster_pool_rules, roster_weekend_mode, archived_at, created_at, roster_excusals(personnel_id, reason, starts_on, ends_on)';
export const CLOSED_ROSTER_FORM_FIELDS = 'id, starts_on, ends_on, record';
export const ROSTER_FORM_FIELDS = 'id, starts_on, rules, roster_starting_numbers(personnel_id, track, count, origin)';
export const SPECIAL_DAY_FIELDS = 'id, organization_id, date, name, type, created_at';
export const AVAILABILITY_FIELDS =
	'id, organization_id, personnel_id, status_type_id, start_date, end_date, note, created_at';
export const ASSIGNMENT_FIELDS = 'id, organization_id, date, assignment_type_id, assignee_id, created_at';

function savedMetadata(row: SavedRow): SavedRow {
	return {
		...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
		...(row.created_at !== undefined ? { created_at: row.created_at } : {})
	};
}

export function toStatusType(row: StatusTypeRow): SavedStatusType {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		textColor: row.text_color,
		shortLabel: row.short_label,
		rosterEffect: row.roster_effect,
		sortOrder: row.sort_order,
		...savedMetadata(row)
	};
}

export function toAssignmentType(row: AssignmentTypeRow): SavedAssignmentType {
	return {
		id: row.id,
		name: row.name,
		shortName: row.short_name,
		assignTo: row.assign_to,
		color: row.color,
		showOnCalendar: row.show_on_calendar,
		sortOrder: row.sort_order,
		poolRules: row.roster_pool_rules,
		weekendMode: row.roster_weekend_mode,
		excusals: (row.roster_excusals ?? [])
			.filter((excusal) => !excusal.ends_on)
			.map(toRosterExcusal)
			.sort((a, b) => a.personId.localeCompare(b.personId)),
		...(row.archived_at !== undefined ? { archivedAt: row.archived_at } : {}),
		...savedMetadata(row)
	};
}

export function toOpenRosterForm(row: RosterFormRow): OpenForm {
	return {
		kind: 'open',
		id: row.id,
		startsOn: row.starts_on,
		rules: { pool: row.rules.pool ?? null, weekendMode: row.rules.weekendMode },
		startingNumbers: (row.roster_starting_numbers ?? []).map((number) => ({
			personId: number.personnel_id,
			track: number.track,
			count: number.count,
			origin: number.origin
		}))
	};
}

const trackSchema = z.enum(['all', 'weekday', 'weekend']) satisfies z.ZodType<TrackId>;
const codeSchema = z.enum(['A', 'D', 'U']);
const personRefSchema = z.object({
	personId: z.string(),
	rank: z.string(),
	lastName: z.string(),
	firstName: z.string()
});
const whenSchema = z.enum(['served', 'planned']);
const da6SegmentSchema = z.object({
	formId: z.string(),
	formState: z.enum(['open', 'closed']),
	natureOfDuty: z.string(),
	month: z.string(),
	weekendMode: weekendModeSchema,
	columns: z.array(
		z.object({
			date: z.string(),
			track: trackSchema,
			when: whenSchema,
			pick: personRefSchema,
			source: z.enum(['manual', 'roster']),
			passedOver: z.array(personRefSchema.extend({ count: z.number(), code: codeSchema, reason: z.string() })),
			rulePick: personRefSchema.nullable()
		})
	),
	rows: z.array(personRefSchema),
	cells: z.array(
		z.array(
			z
				.discriminatedUnion('kind', [
					z.object({ kind: z.literal('count'), count: z.number() }),
					z.object({ kind: z.literal('away'), count: z.number(), reason: z.string() }),
					z.object({ kind: z.literal('code'), code: z.enum(['D', 'U']), count: z.number(), reason: z.string() }),
					z.object({ kind: z.literal('detail'), count: z.number(), when: whenSchema })
				])
				.nullable()
		)
	),
	remarks: z.array(
		z.discriminatedUnion('kind', [
			z.object({
				kind: z.literal('excused'),
				who: personRefSchema,
				reason: z.string(),
				from: z.string(),
				through: z.string().nullable()
			}),
			z.object({
				kind: z.literal('left'),
				who: personRefSchema,
				on: z.string(),
				cause: z.enum(['archived', 'unmatched'])
			}),
			z.object({
				kind: z.literal('joined'),
				who: personRefSchema,
				on: z.string(),
				cause: z.enum(['joined', 'matched', 'reactivated'])
			}),
			z.object({ kind: z.literal('outside'), who: personRefSchema, date: z.string() })
		])
	)
}) satisfies z.ZodType<Da6Segment>;
const closedRecordSchema = z.object({ segments: z.array(z.object({ month: z.string() }).passthrough()) });

/** Parses only the segment for `month`, so a long closed form costs one month of validation. */
export function toClosedFormMonth(row: ClosedRosterFormRow, month: MonthKey): ClosedFormMonth {
	const form = { id: row.id, startsOn: row.starts_on, endsOn: row.ends_on };
	const record = closedRecordSchema.safeParse(row.record);
	const saved = record.success ? record.data.segments.find((candidate) => candidate.month === month) : undefined;
	const segment = saved && da6SegmentSchema.safeParse(saved);
	if (!record.success || (segment && !segment.success)) {
		console.error('[da6] Saved DA 6 record does not match the segment shape', { formId: row.id, month });
		return { ...form, readable: false };
	}
	return { ...form, readable: true, segment: segment ? segment.data : null };
}

function toRosterExcusal(row: RosterExcusalRow): RosterExcusal {
	return { personId: row.personnel_id, reason: row.reason, startsOn: row.starts_on };
}

export function toSpecialDay(row: SpecialDayRow): SavedSpecialDay {
	return { id: row.id, date: row.date, name: row.name, type: row.type, ...savedMetadata(row) };
}

export function toAvailability(row: AvailabilityRow): SavedAvailabilityEntry {
	return {
		id: row.id,
		personnelId: row.personnel_id,
		statusTypeId: row.status_type_id,
		startDate: row.start_date,
		endDate: row.end_date,
		...(row.note !== undefined ? { note: row.note } : {}),
		...savedMetadata(row)
	};
}

export function toAssignment(row: AssignmentRow): SavedAssignment {
	return {
		id: row.id,
		date: row.date,
		assignmentTypeId: row.assignment_type_id,
		assigneeId: row.assignee_id,
		...savedMetadata(row)
	};
}

const catalogName = z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or fewer');

// Status type order changes only through statusTypeOrderInput. Create appends at max + 1, so two
// concurrent creates can tie; every reader orders ties by id.
export const statusTypeCreateInput = z.object({
	name: catalogName,
	color: z.string().optional(),
	textColor: z.string().optional(),
	shortLabel: z
		.string()
		.transform(normalizeShortLabel)
		.refine((label) => label === null || fitsOneDayLabel(label), 'A one-day label has up to 3 characters')
		.nullable()
		.optional(),
	rosterEffect: rosterEffectSchema.optional(),
	sortOrder: z.never({ error: 'Status type order changes through the order command' }).optional()
});
export const statusEffectPreviewInput = z
	.object({ id: uuidSchema, rosterEffect: rosterEffectSchema, today: dateOnlySchema })
	.strict();
export const statusTypeUpdateInput = statusTypeCreateInput.partial().extend({ id: uuidSchema });
const statusTypeIds = z
	.array(uuidSchema)
	.refine((ids) => new Set(ids).size === ids.length, 'Each status type appears once');
export const statusTypeOrderInput = z
	.object({ statusTypeIds: statusTypeIds, expectedStatusTypeIds: statusTypeIds })
	.strict();
const assignmentTypeFields = z.object({
	name: catalogName,
	shortName: z.string(),
	assignTo: z.enum(['personnel', 'group']),
	color: z.string().optional()
});
// A rank range needs both ends, so `rank: null` is the only way to leave rank unconstrained.
const poolRulesInput = poolRulesSchema
	.extend({
		mos: z.array(z.string().trim().min(1).max(40)).max(50),
		role: z.array(z.string().trim().min(1).max(80)).max(50),
		groupIds: z.array(uuidSchema).max(100)
	})
	.strict()
	.transform(normalizePoolRules);
// Calendar visibility and lane order change only through calendarLanesInput, roster rules only through
// rosterSettingsInput once the type exists.
export const assignmentTypeCreateInput = assignmentTypeFields.extend({
	showOnCalendar: z.literal(false).optional(),
	poolRules: poolRulesInput.nullable().optional(),
	weekendMode: weekendModeSchema.optional()
});
export const assignmentTypeUpdateInput = assignmentTypeFields
	.partial()
	.extend({ id: uuidSchema, showOnCalendar: z.never().optional(), today: dateOnlySchema.optional() });
const excusalReason = z
	.string()
	.trim()
	.min(1, 'Add a reason')
	.max(ROSTER_EXCUSAL_REASON_MAX, `A reason has up to ${ROSTER_EXCUSAL_REASON_MAX} characters`);
export const rosterSettingsInput = z
	.object({
		id: uuidSchema,
		poolRules: poolRulesInput.nullable(),
		weekendMode: weekendModeSchema,
		excusals: z
			.array(z.object({ personId: uuidSchema, reason: excusalReason }).strict())
			.max(500)
			.refine(
				(excusals) => new Set(excusals.map(({ personId }) => personId)).size === excusals.length,
				'Each person is excused once'
			),
		today: dateOnlySchema
	})
	.strict();
const laneTypeIds = z
	.array(uuidSchema)
	.refine((ids) => new Set(ids).size === ids.length, 'Each assignment type can be one lane');
export const calendarLanesInput = z.object({ laneTypeIds: laneTypeIds, expectedLaneTypeIds: laneTypeIds }).strict();
export const specialDayUpdateInput = z
	.object({ date: dateOnlySchema, name: z.string(), type: z.enum(['federal-holiday', 'org-closure']) })
	.partial()
	.extend({ id: uuidSchema });
export const closureDaysInput = z.object({
	action: z.literal('addClosureDays'),
	name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
	dates: z
		.array(dateOnlySchema)
		.min(1, 'Pick at least one date')
		.max(MAX_CLOSURE_DAYS, `A closure can cover at most ${MAX_CLOSURE_DAYS} days`)
		.refine((dates) => new Set(dates).size === dates.length, 'Each date appears once')
});
const DATE_RANGE_MESSAGE = 'End date must be on or after the start date';
const availabilityFields = z.object({
	personnelId: uuidSchema,
	statusTypeId: uuidSchema,
	startDate: dateOnlySchema,
	endDate: dateOnlySchema,
	note: z.string().max(200, 'Note must be 200 characters or fewer').nullable().optional()
});
const orderedRange = (entry: { startDate?: string; endDate?: string }) =>
	!entry.startDate || !entry.endDate || entry.startDate <= entry.endDate;

export const availabilityCreateInput = availabilityFields.refine(orderedRange, DATE_RANGE_MESSAGE);
export const availabilityUpdateInput = availabilityFields
	.omit({ personnelId: true })
	.partial()
	.extend({ id: uuidSchema })
	.strict()
	.refine(orderedRange, DATE_RANGE_MESSAGE);
/** An empty assignee clears the slot; any other assignee names a Person or Group. */
export const dailyAssignmentSlotInput = z.object({
	date: dateOnlySchema,
	assignmentTypeId: uuidSchema,
	assigneeId: z.string().refine((value) => value.trim() === '' || isUuid(value.trim()), 'Invalid ID')
});

export function calendarIdChunks(ids: string[]): string[][] {
	const uniqueIds = [...new Set(ids)];
	const chunks: string[][] = [];
	for (let start = 0; start < uniqueIds.length; start += 100) chunks.push(uniqueIds.slice(start, start + 100));
	return chunks;
}
