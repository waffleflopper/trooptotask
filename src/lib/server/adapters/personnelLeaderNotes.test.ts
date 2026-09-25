import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { createTestContext } from './inMemory';
import { createSupabaseDataStore } from './supabaseDataStore';
import { personnelLeaderNoteContext } from './httpAdapter';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
}

describe('Personnel note cursor delivery', () => {
	it.each([false, true])(
		'traverses all tied timestamps with bounded reads and labels (archived=%s)',
		async (archived) => {
			const ctx = createTestContext();
			seedPersonnel(ctx);
			const rows = Array.from({ length: 205 }, (_, index) => ({
				id: `note-${String(index).padStart(3, '0')}`,
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
				text: `Observation ${index}`,
				created_at: index < 102 ? '2026-04-01T12:00:00.123455Z' : '2026-04-01T12:00:00.123456Z',
				archived_at: archived ? '2026-05-01T12:00:00Z' : null
			}));
			ctx.store.seed('leader_notes', [
				...rows,
				{ ...rows[0], id: 'other-person', personnel_id: 'person-2' },
				{ ...rows[0], id: 'other-org', organization_id: 'other-org' },
				{ ...rows[0], id: 'other-state', archived_at: archived ? null : '2026-05-01T12:00:00Z' }
			]);
			ctx.store.seed(
				'organization_memberships',
				rows.map((row, index) => ({
					id: `membership-${index}`,
					organization_id: ctx.auth.orgId,
					user_id: row.author,
					display_name: `Leader ${index}`
				}))
			);
			const read = ctx.store.findMany.bind(ctx.store);
			vi.spyOn(ctx.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
				if (table === 'leader_notes') {
					expect(options?.limit).toBeGreaterThan(0);
					expect(options?.limit).toBeLessThanOrEqual(100);
					expect(options?.range).toBeUndefined();
				}
				return read(table, orgId, filters, options);
			});
			const context = personnelLeaderNoteContext(ctx);
			const labels = context.contributorLabels;
			context.contributorLabels = (ids) => {
				expect(ids.length).toBeLessThanOrEqual(100);
				return labels(ids);
			};
			const notes = await listPersonnelLeaderNotes(context, 'person-1', undefined, { archived });
			expect(notes.map((note) => note.id)).toEqual(
				Array.from({ length: 205 }, (_, i) => `note-${String(204 - i).padStart(3, '0')}`)
			);
			expect(notes[0].author).toBe('Leader 204');
			expect(notes[204].author).toBe('Leader 0');
			if (!archived) {
				const detail = await listPersonnelLeaderNotes(context, 'person-1', 1);
				expect(detail.map((note) => note.id)).toEqual(['note-204']);
			}
		}
	);

	it.each([false, true])(
		'sends disjoint, bounded seek queries through the real provider SDK (archived=%s)',
		async (archived) => {
			const timestamp = '2026-04-01T12:00:00.123456+00:00';
			const cursorId = '11111111-1111-4111-8111-111111111111';
			const tied = { id: '11111111-1111-4111-8111-111111111110', created_at: timestamp };
			const older = { id: '22222222-2222-4222-8222-222222222222', created_at: '2026-04-01T12:00:00.123455+00:00' };
			const queries: URLSearchParams[] = [];
			const client = createClient('http://notes.invalid', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: {
					fetch: async (input) => {
						const url = new URL(String(input));
						expect(url.origin).toBe('http://notes.invalid');
						expect(url.pathname).toBe('/rest/v1/leader_notes');
						queries.push(url.searchParams);
						return Response.json(queries.length === 1 ? [tied] : [older]);
					}
				}
			});
			const ctx = createTestContext();
			const notes = personnelLeaderNoteContext({ ...ctx, store: createSupabaseDataStore(client) });
			const rows = await notes.persistence.listPage('person-1', {
				archived,
				limit: 100,
				before: { createdAt: timestamp, id: cursorId }
			});
			expect(rows).toEqual([tied, older]);
			expect(queries.map((query) => Object.fromEntries([...query].filter(([key]) => key !== 'select')))).toEqual([
				{
					organization_id: 'eq.test-org',
					personnel_id: 'eq.person-1',
					archived_at: archived ? 'not.is.null' : 'is.null',
					order: 'created_at.desc,id.desc',
					created_at: `eq.${timestamp}`,
					id: `lt.${cursorId}`,
					limit: '100'
				},
				{
					organization_id: 'eq.test-org',
					personnel_id: 'eq.person-1',
					archived_at: archived ? 'not.is.null' : 'is.null',
					order: 'created_at.desc,id.desc',
					created_at: `lt.${timestamp}`,
					limit: '99'
				}
			]);
		}
	);

	it('rejects a later-page failure rather than returning an incomplete list', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);
		ctx.store.seed(
			'leader_notes',
			Array.from({ length: 100 }, (_, index) => ({
				id: `note-${index}`,
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				author: 'Leader',
				text: 'Observation',
				created_at: '2026-04-01T12:00:00Z'
			}))
		);
		const read = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((table, orgId, filters, options) => {
			if (table === 'leader_notes' && options?.rangeFilters?.some((filter) => filter.column === 'created_at')) {
				throw new Error('Read unavailable');
			}
			return read(table, orgId, filters, options);
		});
		await expect(listPersonnelLeaderNotes(personnelLeaderNoteContext(ctx), 'person-1')).rejects.toThrow(
			'Read unavailable'
		);
	});
});
