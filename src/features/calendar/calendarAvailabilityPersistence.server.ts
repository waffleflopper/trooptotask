import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { fail, RequestFailure } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { AvailabilityCreate, CalendarAvailabilityPersistence } from './contracts';
import { createSupabaseCalendarAvailabilityRemovalPort } from './availabilityRemovalPersistence.server';
import {
	AVAILABILITY_FIELDS,
	calendarIdChunks,
	toAvailability,
	type AvailabilityRow
} from './calendarPersistenceMapping.server';

function requireAvailabilityMutation(error: { code?: string; message: string } | null): void {
	if (!error) return;
	if (error.code === '42501') fail(403, 'Tasking is unavailable for this Organization');
	if (error.code === '23503' && error.message.includes('"availability_entries_org_status_type_fkey"'))
		fail(404, 'Status type is unavailable for this Organization');
	if (error.code === '23514' && error.message.includes('"availability_entries_note_length"'))
		fail(400, 'Note must be 200 characters or fewer');
	if (error.code === '23514' && error.message.includes('"valid_date_range"'))
		fail(400, 'End date must be on or after the start date');
	throw new Error(error.message);
}

function availabilityInsert(input: AvailabilityCreate, orgId: string) {
	return {
		organization_id: orgId,
		personnel_id: input.personnelId,
		status_type_id: input.statusTypeId,
		start_date: input.startDate,
		end_date: input.endDate,
		note: input.note ?? null,
		set_for_tasking_id: input.setForTaskingId ?? null
	};
}

export function createSupabaseCalendarAvailabilityPersistence(
	client: SupabaseClient,
	{
		orgId,
		scopeSet,
		loadScopedPersonnelIds
	}: { orgId: string; scopeSet: ScopeSet; loadScopedPersonnelIds: () => Promise<string[]> }
): CalendarAvailabilityPersistence {
	const groups = scopeSet.kind === 'groups' ? [...new Set(scopeSet.groupIds.filter(Boolean))] : null;
	let personnelIdsPromise: Promise<string[]> | undefined;
	return {
		...createSupabaseCalendarAvailabilityRemovalPort(client, orgId),
		async listOverlapping(input) {
			if (groups?.length === 0 || input.personnelIds?.length === 0) return [];
			let allowed = input.personnelIds;
			if (groups) {
				const scoped = new Set(await (personnelIdsPromise ??= loadScopedPersonnelIds()));
				allowed = allowed === undefined ? [...scoped] : allowed.filter((id) => scoped.has(id));
			}
			if (allowed?.length === 0 || (allowed && input.personnelId !== undefined && !allowed.includes(input.personnelId)))
				return [];
			// Once scope admits a single Person, that Person's own filter bounds the read.
			const chunks = allowed === undefined || input.personnelId !== undefined ? [undefined] : calendarIdChunks(allowed);
			const rows: AvailabilityRow[] = [];
			for (const ids of chunks) {
				const result = await selectAllSupabaseRows<AvailabilityRow>(async (from, to) => {
					let query = client
						.from('availability_entries')
						.select(AVAILABILITY_FIELDS)
						.eq('organization_id', orgId)
						.gte('end_date', input.rangeStart)
						.lte('start_date', input.rangeEnd);
					if (input.personnelId !== undefined) query = query.eq('personnel_id', input.personnelId);
					if (ids) query = query.in('personnel_id', ids);
					if (input.orderByEndDate) query = query.order('end_date', { ascending: true });
					const { data, error } = await query
						.order('id', { ascending: true })
						.range(from, to)
						.returns<AvailabilityRow[]>();
					return { data, error };
				});
				if (result.error) throw new Error((result.error as { message: string }).message);
				rows.push(...(result.data ?? []));
			}
			if (input.orderByEndDate && chunks.length > 1) rows.sort((a, b) => a.end_date.localeCompare(b.end_date));
			return rows.map(toAvailability);
		},
		async listPersonnelHistory(personnelId) {
			const result = await selectAllSupabaseRows<AvailabilityRow>(async (from, to) => {
				const { data, error } = await client
					.from('availability_entries')
					.select(AVAILABILITY_FIELDS)
					.eq('organization_id', orgId)
					.eq('personnel_id', personnelId)
					.order('start_date', { ascending: false })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<AvailabilityRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toAvailability);
		},
		async findReference(id) {
			const { data, error } = await client
				.from('availability_entries')
				.select('personnel_id')
				.eq('organization_id', orgId)
				.eq('id', id)
				.single<{ personnel_id: string }>();
			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}
			return data ? { personnelId: data.personnel_id } : null;
		},
		async create(input) {
			const { data, error } = await client
				.from('availability_entries')
				.insert(availabilityInsert(input, orgId))
				.select(AVAILABILITY_FIELDS)
				.single<AvailabilityRow>();
			requireAvailabilityMutation(error);
			return toAvailability(data!);
		},
		async update(id, patch) {
			const { data, error } = await client
				.from('availability_entries')
				.update({
					status_type_id: patch.statusTypeId,
					start_date: patch.startDate,
					end_date: patch.endDate,
					note: patch.note
				})
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(AVAILABILITY_FIELDS)
				.single<AvailabilityRow>();
			requireAvailabilityMutation(error);
			return toAvailability(data!);
		},
		async delete(id) {
			const { error } = await client.from('availability_entries').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			const { data, error } = await client
				.from('availability_entries')
				.insert(inputs.map((input) => availabilityInsert(input, orgId)))
				.select(AVAILABILITY_FIELDS)
				.returns<AvailabilityRow[]>();
			requireAvailabilityMutation(error);
			return (data ?? []).map(toAvailability);
		},
		async insertReplacing(entries) {
			const { data, error } = await client.rpc('import_availability_entries', {
				p_organization_id: orgId,
				p_entries: entries.map((entry) => ({
					personnel_id: entry.personnelId,
					status_type_id: entry.statusTypeId,
					start_date: entry.startDate,
					end_date: entry.endDate,
					note: entry.note ?? null,
					overlap: entry.overlap,
					alongside: (entry.alongside ?? []).map((partner) => ({
						status_type_id: partner.statusTypeId,
						start_date: partner.startDate,
						end_date: partner.endDate
					})),
					replaces: entry.replaces.map((replaced) => ({
						id: replaced.id,
						status_type_id: replaced.statusTypeId,
						start_date: replaced.startDate,
						end_date: replaced.endDate,
						note: replaced.note
					}))
				}))
			});
			if (error?.code === '42501') throw new RequestFailure(403, 'You do not have access to that Calendar scope');
			if (error?.code === '22023')
				throw new RequestFailure(400, 'Provide between 1 and 500 statuses and at most 500 replaced entries to import');
			requireAvailabilityMutation(error);
			const { inserted, deleted, stale } = (data ?? {}) as { inserted?: unknown; deleted?: unknown; stale?: unknown };
			const replaced = entries.reduce((total, entry) => total + entry.replaces.length, 0);
			if (
				!Array.isArray(stale) ||
				!stale.every(
					(index, position) =>
						Number.isInteger(index) &&
						index >= 0 &&
						index < entries.length &&
						(position === 0 || index > stale[position - 1])
				) ||
				inserted !== entries.length - stale.length ||
				typeof deleted !== 'number' ||
				!Number.isInteger(deleted) ||
				deleted < 0 ||
				deleted > replaced
			)
				throw new Error('Invalid Calendar import acknowledgment');
			return { inserted: entries.length - stale.length, deleted, stale: stale as number[] };
		}
	};
}
