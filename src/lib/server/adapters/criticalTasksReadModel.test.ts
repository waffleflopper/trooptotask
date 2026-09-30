import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseCriticalTasksReadModelAdapter } from './criticalTasksReadModel';

describe('Critical Tasks latest completion provider', () => {
	it.each([1000, 1003])('retains all %i latest records across the provider page limit', async (count) => {
		const rows = Array.from({ length: count }, (_, index) => ({
			id: `completion-${index}`,
			personnel_id: `person-${index}`,
			ict_task_id: 'task-common',
			completed_at: '2026-09-29',
			created_at: '2026-09-29T12:00:00Z'
		}));
		const client = createClient('https://synthetic.example.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					const body = JSON.parse(String(init?.body));
					expect(init?.method).toBe('POST');
					expect(body).toEqual({ p_organization_id: 'org-a', p_personnel_ids: null, p_ict_task_ids: null });
					const offset = Number(url.searchParams.get('offset') ?? 0);
					return Response.json(rows.slice(offset, offset + 1000));
				}
			}
		});
		const result = await createSupabaseCriticalTasksReadModelAdapter(client).findLatestCompletions('org-a');
		expect(result.map((row) => row.id)).toEqual(rows.map((row) => row.id));
	});

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
