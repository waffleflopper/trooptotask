import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fail } from '$lib/errors';
import type { PersonnelDeletionReferencesPort } from '$features/personnel/contracts';
import { TASKING_GONE } from '../taskingPersistence.server';
import type { StaffingAdvisory, StaffingCount, StaffingSave, TaskingPick, TaskingStaffing } from './staffingModel';

export const STAFFING_INELIGIBLE =
	'Someone on this list can no longer be picked for this tasking. Review the list and save again.';
const STAFFING_CLOSED = 'A completed or cancelled tasking keeps its staffing. Reopen it to change who is picked.';
const STAFFING_DENIED = 'You do not have Calendar operation access to staff this tasking.';

export interface CalendarStaffingPersistence {
	/** Null when the reader cannot see the Tasking. */
	findStaffing(taskingId: string): Promise<TaskingStaffing | null>;
	/** Counts for the given Taskings the reader can see; others are absent. */
	countStaffing(taskingIds: string[]): Promise<Record<string, StaffingCount>>;
	/** By Person, over the Tasking's execution dates; empty unless the reader may staff it. */
	listAdvisories(taskingId: string): Promise<Record<string, StaffingAdvisory[]>>;
	saveStaffing(taskingId: string, save: StaffingSave): Promise<'saved' | 'unchanged' | 'conflict'>;
}

const countRowSchema = z.object({
	tasking_id: z.string(),
	revision: z.number(),
	picked: z.number(),
	needs_review: z.number(),
	outside_scope: z.number()
});

const pickRowSchema = z
	.object({
		personnel_id: z.string(),
		rank: z.string().nullable(),
		first_name: z.string(),
		last_name: z.string(),
		group_id: z.string().nullable(),
		archived: z.boolean(),
		selected_at: z.string(),
		review_since: z.string().nullable()
	})
	.transform(
		(row): TaskingPick => ({
			personnelId: row.personnel_id,
			rank: row.rank ?? '',
			firstName: row.first_name,
			lastName: row.last_name,
			groupId: row.group_id,
			archived: row.archived,
			selectedAt: row.selected_at,
			reviewSince: row.review_since
		})
	);

const advisoryRowSchema = z
	.object({
		personnel_id: z.string(),
		kind: z.enum(['availability', 'tasking']),
		label: z.string().nullable(),
		starts_on: z.string().nullable(),
		ends_on: z.string().nullable(),
		other_tasking_id: z.string().nullable()
	})
	.transform((row): [string, StaffingAdvisory] => {
		if (row.kind === 'availability')
			return [
				row.personnel_id,
				{ kind: 'availability', label: row.label ?? '', startsOn: row.starts_on ?? '', endsOn: row.ends_on ?? '' }
			];
		if (row.other_tasking_id === null || row.label === null || !row.starts_on || !row.ends_on)
			return [row.personnel_id, { kind: 'committed_elsewhere' }];
		return [
			row.personnel_id,
			{
				kind: 'tasking',
				taskingId: row.other_tasking_id,
				title: row.label,
				startsOn: row.starts_on,
				endsOn: row.ends_on
			}
		];
	});

const saveRowSchema = z.object({ outcome: z.enum(['saved', 'unchanged', 'conflict']), revision: z.number() });

function writeFailure(error: { code?: string; message: string }): never {
	switch (error.code) {
		case '42501':
			return fail(403, STAFFING_DENIED);
		case 'P0002':
			return fail(404, TASKING_GONE);
		case '55000':
			return fail(409, STAFFING_CLOSED);
		case '23514':
			return fail(409, STAFFING_INELIGIBLE);
		case '22023':
			return fail(400, 'Pick each person once.');
		default:
			throw new Error(error.message);
	}
}

const counted = (row: z.output<typeof countRowSchema>): StaffingCount => ({
	picked: row.picked,
	needsReview: row.needs_review,
	outsideScope: row.outside_scope
});

export function createSupabaseCalendarStaffingPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarStaffingPersistence {
	async function rpcRows(name: string, args: Record<string, unknown>): Promise<unknown[]> {
		const { data, error } = await client.rpc(name, { p_organization_id: orgId, ...args });
		if (error) throw new Error(error.message);
		return (data ?? []) as unknown[];
	}

	async function countRows(taskingIds: string[]) {
		if (taskingIds.length === 0) return [];
		return (await rpcRows('calendar_tasking_staffing', { p_tasking_ids: [...new Set(taskingIds)] })).map((row) =>
			countRowSchema.parse(row)
		);
	}

	return {
		async findStaffing(taskingId) {
			const [[count], picks] = await Promise.all([
				countRows([taskingId]),
				rpcRows('calendar_tasking_people', { p_tasking_id: taskingId })
			]);
			if (!count) return null;
			return { ...counted(count), revision: count.revision, picks: picks.map((row) => pickRowSchema.parse(row)) };
		},
		async countStaffing(taskingIds) {
			return Object.fromEntries((await countRows(taskingIds)).map((row) => [row.tasking_id, counted(row)]));
		},
		async listAdvisories(taskingId) {
			const byPerson: Record<string, StaffingAdvisory[]> = {};
			for (const row of await rpcRows('calendar_tasking_advisories', { p_tasking_id: taskingId })) {
				const [personnelId, advisory] = advisoryRowSchema.parse(row);
				(byPerson[personnelId] ??= []).push(advisory);
			}
			return byPerson;
		},
		async saveStaffing(taskingId, save) {
			const { data, error } = await client.rpc('save_calendar_tasking_people', {
				p_organization_id: orgId,
				p_tasking_id: taskingId,
				p_personnel_ids: save.personnelIds,
				p_kept_ids: save.keep,
				p_remove_outside_scope: save.removeOutsideScope,
				p_expected_revision: save.expectedRevision
			});
			if (error) return writeFailure(error);
			const [row] = z.array(saveRowSchema).parse(data);
			if (!row) throw new Error('save_calendar_tasking_people returned no outcome');
			return row.outcome;
		}
	};
}

/** Reads Calendar's references for Personnel's permanent deletion, scoped like the actor's Calendar view. */
export function createSupabaseCalendarDeletionReferences(
	client: SupabaseClient,
	orgId: string
): PersonnelDeletionReferencesPort {
	return {
		async find(target) {
			const { data, error } = await client.rpc('calendar_deletion_references', {
				p_organization_id: orgId,
				p_personnel_id: 'personnelId' in target ? target.personnelId : null,
				p_group_id: 'groupId' in target ? target.groupId : null
			});
			if (error) throw new Error(error.message);
			const rows = z.array(z.object({ tasking_id: z.string().nullable(), title: z.string().nullable() })).parse(data);
			const taskingTitles = rows.flatMap((row) => (row.title === null ? [] : [row.title]));
			return { taskingTitles, hiddenTaskings: rows.length - taskingTitles.length };
		}
	};
}
