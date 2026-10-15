import { z } from 'zod';
import type {
	SavedAssignment,
	SavedAssignmentType,
	SavedAvailabilityEntry,
	SavedSpecialDay,
	SavedStatusType
} from './contracts';
import { fitsOneDayLabel, normalizeShortLabel } from './utils/oneDayLabel';

type SavedRow = { organization_id?: string; created_at?: string };

export type StatusTypeRow = SavedRow & {
	id: string;
	name: string;
	color: string;
	text_color: string;
	short_label: string | null;
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
	exempt_personnel_ids: string[] | null;
	archived_at?: string | null;
};
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

export const STATUS_TYPE_FIELDS = 'id, organization_id, name, color, text_color, short_label, sort_order, created_at';
export const ASSIGNMENT_TYPE_FIELDS =
	'id, organization_id, name, short_name, assign_to, color, sort_order, show_on_calendar, exempt_personnel_ids, archived_at, created_at';
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
		exemptPersonnelIds: row.exempt_personnel_ids ?? [],
		...(row.archived_at !== undefined ? { archivedAt: row.archived_at } : {}),
		...savedMetadata(row)
	};
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

// Status type order changes only through statusTypeOrderInput; create appends.
export const statusTypeCreateInput = z.object({
	name: z.string().min(1).max(100),
	color: z.string().optional(),
	textColor: z.string().optional(),
	shortLabel: z
		.string()
		.transform(normalizeShortLabel)
		.refine((label) => label === null || fitsOneDayLabel(label), 'A one-day label has up to 3 characters')
		.nullable()
		.optional(),
	sortOrder: z.never({ error: 'Status type order changes through the order command' }).optional()
});
export const statusTypeUpdateInput = statusTypeCreateInput.partial().extend({ id: z.string() });
// Any database uuid: demo-seeded ids carry no RFC version, and the command's uuid[] parameter enforces the type.
const statusTypeIds = z
	.array(z.guid())
	.refine((ids) => new Set(ids).size === ids.length, 'Each status type appears once');
export const statusTypeOrderInput = z
	.object({ statusTypeIds: statusTypeIds, expectedStatusTypeIds: statusTypeIds })
	.strict();
const assignmentTypeFields = z.object({
	name: z.string().min(1).max(100),
	shortName: z.string(),
	assignTo: z.enum(['personnel', 'group']),
	color: z.string().optional(),
	exemptPersonnelIds: z.array(z.string().uuid()).max(500).optional()
});
// Calendar visibility and lane order change only through calendarLanesInput.
export const assignmentTypeCreateInput = assignmentTypeFields.extend({
	showOnCalendar: z.literal(false).optional()
});
export const assignmentTypeUpdateInput = assignmentTypeFields
	.partial()
	.extend({ id: z.string(), showOnCalendar: z.never().optional() });
const laneTypeIds = z
	.array(z.guid())
	.refine((ids) => new Set(ids).size === ids.length, 'Each assignment type can be one lane');
export const calendarLanesInput = z.object({ laneTypeIds: laneTypeIds, expectedLaneTypeIds: laneTypeIds }).strict();
export const specialDayCreateInput = z.object({
	date: z.string(),
	name: z.string(),
	type: z.enum(['federal-holiday', 'org-closure'])
});
export const specialDayUpdateInput = specialDayCreateInput.partial().extend({ id: z.string() });
export const availabilityCreateInput = z.object({
	personnelId: z.string(),
	statusTypeId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
	note: z.string().nullable().optional()
});
export const availabilityUpdateInput = availabilityCreateInput
	.omit({ personnelId: true })
	.partial()
	.extend({ id: z.string() })
	.strict();
export const dailyAssignmentSlotInput = z.object({
	date: z.string(),
	assignmentTypeId: z.string(),
	assigneeId: z.string()
});

export function calendarIdChunks(ids: string[]): string[][] {
	const uniqueIds = [...new Set(ids)];
	const chunks: string[][] = [];
	for (let start = 0; start < uniqueIds.length; start += 100) chunks.push(uniqueIds.slice(start, start + 100));
	return chunks;
}
