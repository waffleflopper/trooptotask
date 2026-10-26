import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import {
	CLOSED_TASKING_LIMIT,
	transitionNote,
	type StaffingRequirement,
	type Tasking,
	type TaskingActivity,
	type TaskingDraft,
	type TaskingListScope,
	type TaskingResponsibility,
	type TaskingSchedule,
	type TaskingStatus,
	type TaskingTransition
} from './taskingModel';
import { namedPeople, readPersonLabels } from './staffing/personLabels.server';

export const TASKING_GONE = 'That tasking is no longer available.';
export const TASKING_STATUS_CHANGED = 'This tasking’s status has changed. Reload to see where it stands now.';
const TASKING_DENIED = 'You do not have Calendar operation access for this tasking.';
const TASKING_REFERENCE = 'Choose an Event and a Group from this organization.';

export interface CalendarTaskingPersistence {
	listTaskings(scope: TaskingListScope): Promise<Tasking[]>;
	listEventTaskings(eventId: string): Promise<Tasking[]>;
	findTasking(id: string): Promise<Tasking | null>;
	listActivity(taskingId: string): Promise<TaskingActivity[]>;
	findEventTitles(ids: string[]): Promise<Record<string, string>>;
	/** Retrying the same id converges on the Tasking the first attempt created, with `created` false. */
	createTasking(id: string, draft: TaskingDraft): Promise<{ tasking: Tasking; created: boolean }>;
	updateTasking(id: string, draft: TaskingDraft): Promise<Tasking | null>;
	/** Repeating an action that already landed changes nothing, and `moved` is false. */
	transitionTasking(id: string, transition: TaskingTransition): Promise<{ tasking: Tasking; moved: boolean }>;
}

const COLUMNS = [
	'id, title, event_id, responsible_group_id, suspense_on, execution_starts_on, execution_ends_on, report_time',
	'staffing_required, qualifications, instructions, status',
	'block_reason, blocked_at, blocked_by, completion_note, completed_at, completed_by',
	'cancellation_reason, cancelled_at, cancelled_by',
	'event:calendar_events!calendar_taskings_event_fkey(id, title, starts_on, ends_on, cancelled_at)'
].join(', ');

const statusRowSchema = z.discriminatedUnion('status', [
	z.object({ status: z.literal('open') }),
	z.object({ status: z.literal('in_progress') }),
	z.object({
		status: z.literal('blocked'),
		block_reason: z.string(),
		blocked_at: z.string(),
		blocked_by: z.string().nullable()
	}),
	z.object({
		status: z.literal('completed'),
		completion_note: z.string().nullable(),
		completed_at: z.string(),
		completed_by: z.string().nullable()
	}),
	z.object({
		status: z.literal('cancelled'),
		cancellation_reason: z.string().nullable(),
		cancelled_at: z.string(),
		cancelled_by: z.string().nullable()
	})
]);

const taskingRowSchema = z
	.object({
		id: z.string(),
		title: z.string(),
		responsible_group_id: z.string().nullable(),
		suspense_on: z.string(),
		execution_starts_on: z.string().nullable(),
		execution_ends_on: z.string().nullable(),
		report_time: z.string().nullable(),
		staffing_required: z.number().nullable(),
		qualifications: z.string().nullable(),
		instructions: z.string().nullable(),
		event: z
			.object({
				id: z.string(),
				title: z.string(),
				starts_on: z.string(),
				ends_on: z.string(),
				cancelled_at: z.string().nullable()
			})
			.nullable()
	})
	.and(statusRowSchema);

type TaskingRow = z.output<typeof taskingRowSchema>;
type PagedQuery = { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }> };

const responsibilityFrom = (groupId: string | null): TaskingResponsibility =>
	groupId === null ? { kind: 'organization' } : { kind: 'group', groupId };

const reportTimeFrom = (value: string | null) => (value === null ? null : value.slice(0, 5));

function statusFrom(row: TaskingRow): TaskingStatus {
	switch (row.status) {
		case 'open':
		case 'in_progress':
			return { kind: row.status };
		case 'blocked':
			return { kind: 'blocked', reason: row.block_reason, at: row.blocked_at, by: row.blocked_by };
		case 'completed':
			return { kind: 'completed', note: row.completion_note, at: row.completed_at, by: row.completed_by };
		case 'cancelled':
			return { kind: 'cancelled', reason: row.cancellation_reason, at: row.cancelled_at, by: row.cancelled_by };
	}
}

function toTasking(raw: unknown): Tasking {
	const row = taskingRowSchema.parse(raw);
	return {
		id: row.id,
		title: row.title,
		event: row.event && {
			id: row.event.id,
			title: row.event.title,
			startsOn: row.event.starts_on,
			endsOn: row.event.ends_on,
			cancelled: row.event.cancelled_at !== null
		},
		responsibility: responsibilityFrom(row.responsible_group_id),
		suspenseOn: row.suspense_on,
		execution:
			row.execution_starts_on && row.execution_ends_on
				? {
						startsOn: row.execution_starts_on,
						endsOn: row.execution_ends_on,
						reportTime: reportTimeFrom(row.report_time)
					}
				: null,
		requirement:
			row.staffing_required === null ? null : { count: row.staffing_required, qualifications: row.qualifications },
		instructions: row.instructions,
		status: statusFrom(row)
	};
}

const scheduleSchema = z
	.object({
		suspenseOn: z.string(),
		executionStartsOn: z.string().nullable(),
		executionEndsOn: z.string().nullable(),
		reportTime: z.string().nullable()
	})
	.transform(
		(value): TaskingSchedule => ({
			suspenseOn: value.suspenseOn,
			execution:
				value.executionStartsOn && value.executionEndsOn
					? { startsOn: value.executionStartsOn, endsOn: value.executionEndsOn, reportTime: value.reportTime }
					: null
		})
	);
const requirementSchema = z
	.object({ count: z.number().nullable(), qualifications: z.string().nullable() })
	.transform((value): StaffingRequirement | null =>
		value.count === null ? null : { count: value.count, qualifications: value.qualifications }
	);
const responsibilitySchema = z.string().nullable().transform(responsibilityFrom);

const activityRowSchema = z.object({ id: z.number(), occurred_at: z.string(), actor_id: z.string().nullable() }).and(
	z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('created') }),
		z.object({ kind: z.literal('outcome_changed'), payload: z.object({ from: z.string(), to: z.string() }) }),
		z.object({
			kind: z.literal('responsibility_changed'),
			payload: z.object({ from: responsibilitySchema, to: responsibilitySchema })
		}),
		z.object({ kind: z.literal('dates_changed'), payload: z.object({ from: scheduleSchema, to: scheduleSchema }) }),
		z.object({ kind: z.literal('linked'), payload: z.object({ eventId: z.string() }) }),
		z.object({ kind: z.literal('unlinked'), payload: z.object({ eventId: z.string() }) }),
		z.object({
			kind: z.literal('requirement_changed'),
			payload: z.object({ from: requirementSchema, to: requirementSchema })
		}),
		z.object({ kind: z.literal('instructions_changed') }),
		z.object({ kind: z.literal('started') }),
		z.object({ kind: z.literal('blocked'), payload: z.object({ reason: z.string() }) }),
		z.object({ kind: z.literal('unblocked') }),
		z.object({ kind: z.literal('completed'), payload: z.object({ note: z.string().nullable() }) }),
		z.object({ kind: z.literal('reopened') }),
		z.object({ kind: z.literal('cancelled'), payload: z.object({ reason: z.string().nullable() }) }),
		z.object({
			kind: z.literal('staffing_changed'),
			payload: z.object({ added: z.array(z.string()), removed: z.array(z.string()), kept: z.array(z.string()) })
		})
	])
);

type ActivityRow = z.output<typeof activityRowSchema>;

function toActivity(row: ActivityRow, labels: Map<string, string>): TaskingActivity {
	const base = { id: row.id, at: row.occurred_at, actorUserId: row.actor_id };
	switch (row.kind) {
		case 'created':
		case 'instructions_changed':
		case 'started':
		case 'unblocked':
		case 'reopened':
			return { ...base, kind: row.kind };
		case 'outcome_changed':
			return { ...base, kind: row.kind, ...row.payload };
		case 'responsibility_changed':
			return { ...base, kind: row.kind, ...row.payload };
		case 'dates_changed':
			return { ...base, kind: row.kind, ...row.payload };
		case 'requirement_changed':
			return { ...base, kind: row.kind, ...row.payload };
		case 'linked':
		case 'unlinked':
			return { ...base, kind: row.kind, eventId: row.payload.eventId };
		case 'blocked':
			return { ...base, kind: 'blocked', reason: row.payload.reason };
		case 'completed':
			return { ...base, kind: 'completed', note: row.payload.note };
		case 'cancelled':
			return { ...base, kind: 'cancelled', reason: row.payload.reason };
		case 'staffing_changed':
			return {
				...base,
				kind: row.kind,
				added: namedPeople(row.payload.added, labels),
				removed: namedPeople(row.payload.removed, labels),
				kept: namedPeople(row.payload.kept, labels)
			};
	}
}

function draftColumns(draft: TaskingDraft) {
	return {
		title: draft.title,
		event_id: draft.eventId,
		responsible_group_id: draft.responsibility.kind === 'group' ? draft.responsibility.groupId : null,
		suspense_on: draft.suspenseOn,
		execution_starts_on: draft.execution?.startsOn ?? null,
		execution_ends_on: draft.execution?.endsOn ?? null,
		report_time: draft.execution?.reportTime ?? null,
		staffing_required: draft.requirement?.count ?? null,
		qualifications: draft.requirement?.qualifications ?? null,
		instructions: draft.instructions
	};
}

function writeFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, TASKING_DENIED);
		case '55000':
			return fail(409, TASKING_STATUS_CHANGED);
		case 'P0002':
			return fail(404, TASKING_GONE);
		case '23503':
			return fail(400, TASKING_REFERENCE);
		case '23514':
		case '22023':
			return fail(400, 'Check the tasking details and try again.');
		default:
			throw new Error(error.message);
	}
}

export function createSupabaseCalendarTaskingPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarTaskingPersistence {
	const taskings = () => client.from('calendar_taskings').select(COLUMNS).eq('organization_id', orgId);

	async function findTasking(id: string) {
		const { data, error } = await taskings().eq('id', id).maybeSingle();
		if (error) throw new Error(error.message);
		return data ? toTasking(data) : null;
	}

	async function rows(query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
		const { data, error } = await query;
		if (error) throw new Error(error.message);
		return (data ?? []).map(toTasking);
	}

	async function allRows(query: () => PagedQuery) {
		const { data, error } = await selectAllSupabaseRows(async (from, to) => await query().range(from, to));
		if (error) throw new Error((error as { message: string }).message);
		return data ?? [];
	}

	return {
		listTaskings(scope) {
			if (scope === 'active')
				return allRows(() =>
					taskings().in('status', ['open', 'in_progress', 'blocked']).order('suspense_on').order('id')
				).then((data) => data.map(toTasking));
			const at = scope === 'completed' ? 'completed_at' : 'cancelled_at';
			return rows(
				taskings().eq('status', scope).order(at, { ascending: false }).order('id').limit(CLOSED_TASKING_LIMIT)
			);
		},
		listEventTaskings(eventId) {
			return allRows(() => taskings().eq('event_id', eventId).order('suspense_on').order('title').order('id')).then(
				(data) => data.map(toTasking)
			);
		},
		findTasking,
		async listActivity(taskingId) {
			const data = await allRows(() =>
				client
					.from('calendar_tasking_activity')
					.select('id, occurred_at, actor_id, kind, payload')
					.eq('organization_id', orgId)
					.eq('tasking_id', taskingId)
					.order('id')
			);
			const rows = data.map((row) => activityRowSchema.parse(row));
			const people = rows.flatMap((row) => (row.kind === 'staffing_changed' ? Object.values(row.payload).flat() : []));
			const labels = await readPersonLabels(client, orgId, people);
			return rows.map((row) => toActivity(row, labels));
		},
		async findEventTitles(ids) {
			if (ids.length === 0) return {};
			const { data, error } = await client
				.from('calendar_events')
				.select('id, title')
				.eq('organization_id', orgId)
				.in('id', [...new Set(ids)]);
			if (error) throw new Error(error.message);
			return Object.fromEntries((data ?? []).map((row) => [row.id, row.title]));
		},
		async createTasking(id, draft) {
			const { data, error } = await client
				.from('calendar_taskings')
				.insert({ id, organization_id: orgId, ...draftColumns(draft) })
				.select(COLUMNS)
				.single();
			if (error?.code === '23505') {
				const existing = await findTasking(id);
				if (existing) return { tasking: existing, created: false };
			}
			if (error) return writeFailure(error);
			return { tasking: toTasking(data), created: true };
		},
		async updateTasking(id, draft) {
			const { data, error } = await client
				.from('calendar_taskings')
				.update(draftColumns(draft))
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(COLUMNS)
				.maybeSingle();
			if (error) return writeFailure(error);
			return data ? toTasking(data) : null;
		},
		async transitionTasking(id, transition) {
			const { data, error } = await client.rpc('transition_calendar_tasking', {
				p_organization_id: orgId,
				p_tasking_id: id,
				p_action: transition.action,
				p_note: transitionNote(transition)
			});
			if (error) return writeFailure(error);
			const tasking = await findTasking(id);
			if (!tasking) return fail(404, TASKING_GONE);
			return { tasking, moved: z.boolean().parse(data) };
		}
	};
}
