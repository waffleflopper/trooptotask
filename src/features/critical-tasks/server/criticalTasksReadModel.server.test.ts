import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseCriticalTasksReadModelAdapter } from './criticalTasksReadModel.server';

describe('Critical Tasks latest completion provider', () => {
	it.each([1000, 1003])('retains all %i latest records across the provider page limit', async (count) => {
		const rows = Array.from({ length: count }, (_, index) => ({
			id: `completion-${index}`,
			personnel_id: `person-${index}`,
			ict_task_id: 'task-common',
			completed_at: '2026-09-29',
			created_at: '2026-09-29T12:00:00.654321Z',
			validation_method: 'Demonstration',
			validated_by: null,
			notes: `Row${index}`,
			logged_by: null
		}));
		const servedOffsets: number[] = [];
		const personnelIds = count === 1003 ? rows.map((row) => row.personnel_id) : undefined;
		const client = createClient('https://synthetic.example.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					const body = JSON.parse(String(init?.body));
					expect(init?.method).toBe('POST');
					expect(body).toEqual({
						p_organization_id: 'org-a',
						p_personnel_ids: personnelIds ?? null,
						p_ict_task_ids: personnelIds ? ['task-common'] : null
					});
					expect(url.searchParams.get('order')).toBe('personnel_id.asc,ict_task_id.asc');
					const offset = Number(url.searchParams.get('offset') ?? 0);
					if (offset !== 0 && offset !== 1000) throw new Error('Unexpected page after terminal response');
					servedOffsets.push(offset);
					return Response.json(rows.slice(offset, offset + 1000));
				}
			}
		});
		const result = await createSupabaseCriticalTasksReadModelAdapter(client).findLatestCompletions(
			'org-a',
			personnelIds
				? { personnelIds: [...personnelIds, personnelIds[0]], taskIds: ['task-common', 'task-common'] }
				: undefined
		);
		expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
		expect(result[0]).toEqual({
			id: 'completion-0',
			personnelId: 'person-0',
			ictTaskId: 'task-common',
			completedAt: '2026-09-29',
			createdAt: '2026-09-29T12:00:00.654321Z',
			validationMethod: 'Demonstration',
			validatedBy: null,
			notes: 'Row0',
			loggedBy: null
		});
		expect(servedOffsets).toEqual([0, 1000]);
	});

	it.each(['personnelIds', 'taskIds'] as const)(
		'returns no records for empty %s without contacting the provider',
		async (field) => {
			const client = createClient('https://synthetic.example.test', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false },
				global: {
					fetch: async () => {
						throw new Error('Empty scope must not contact provider');
					}
				}
			});
			await expect(
				createSupabaseCriticalTasksReadModelAdapter(client).findLatestCompletions('org-a', { [field]: [] })
			).resolves.toEqual([]);
		}
	);

	it('rejects unavailable later history rather than returning an incomplete first page', async () => {
		const client = createClient('https://synthetic.example.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					const offset = Number(new URL(String(input)).searchParams.get('offset') ?? 0);
					return offset >= 1000
						? Response.json({ message: 'History unavailable' }, { status: 503 })
						: Response.json(Array.from({ length: 1000 }, (_, index) => ({ id: `completion-${index}` })));
				}
			}
		});
		await expect(createSupabaseCriticalTasksReadModelAdapter(client).findLatestCompletions('org-a')).rejects.toThrow(
			'History unavailable'
		);
	});
});
