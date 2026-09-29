import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseDataStore } from './supabaseDataStore';

const foreignCalendarStatus = {
	code: '23503',
	message:
		'insert or update on table "availability_entries" violates foreign key constraint "availability_entries_org_status_type_fkey"',
	details: 'Key (organization_id, status_type_id)=(private-org, private-status) is not present.',
	hint: ''
};

const duplicateTaskCode = {
	...foreignCalendarStatus,
	code: '23505',
	message: 'duplicate key value violates unique constraint "ict_tasks_organization_id_task_code_key"'
};

function storeWithProviderError(error: typeof foreignCalendarStatus) {
	const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async () =>
				new Response(JSON.stringify(error), {
					status: 409,
					headers: { 'Content-Type': 'application/json' }
				})
		}
	});
	return createSupabaseDataStore(client);
}

const writes = ['insert', 'insertMany', 'update'] as const;

function write(store: ReturnType<typeof createSupabaseDataStore>, method: (typeof writes)[number], table: string) {
	const data = { date: '2026-03-22', assignment_type_id: 'type-a', assignee_id: 'person-a' };
	switch (method) {
		case 'insert':
			return store.insert(table, 'org-a', data);
		case 'insertMany':
			return store.insertMany(table, 'org-a', [data]);
		case 'update':
			return store.update(table, 'org-a', 'saved-slot', data);
	}
}

describe('Supabase DataStore conflict handling', () => {
	it.each(writes)('%s returns a conflict for a duplicate Critical Tasks code', async (method) => {
		await expect(write(storeWithProviderError(duplicateTaskCode), method, 'ict_tasks')).rejects.toMatchObject({
			status: 409,
			message: 'Task code already exists in this Organization'
		});
	});

	it.each(writes)('%s returns a concealed 404 for a foreign Calendar status reference', async (method) => {
		await expect(
			write(storeWithProviderError(foreignCalendarStatus), method, 'availability_entries')
		).rejects.toMatchObject({
			status: 404,
			message: 'Status type is unavailable for this Organization'
		});
	});

	it.each([
		['another table', 'personnel', foreignCalendarStatus],
		[
			'another foreign key',
			'availability_entries',
			{ ...foreignCalendarStatus, message: 'violates foreign key constraint "availability_entries_personnel_id_fkey"' }
		],
		['another provider code', 'availability_entries', { ...foreignCalendarStatus, code: '42501' }]
	])('does not reinterpret %s as a Calendar status reference', async (_label, table, error) => {
		const result = write(storeWithProviderError(error), 'insert', table);
		await expect(result).rejects.toThrow(error.message);
		await expect(result).rejects.not.toHaveProperty('status');
	});
});
