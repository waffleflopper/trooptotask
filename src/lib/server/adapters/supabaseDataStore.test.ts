import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseDataStore } from './supabaseDataStore';

const slotConflict = {
	code: '23505',
	message: 'duplicate key value violates unique constraint "daily_assignments_clinic_id_assignment_type_id_date_key"',
	details: 'Key (organization_id, assignment_type_id, date)=(hidden-org, hidden-type, 2026-03-22) already exists.',
	hint: ''
};

function storeWithProviderError(error: typeof slotConflict) {
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
	it.each(writes)(
		'%s returns a safe 409 for a Calendar slot collision without exposing provider details',
		async (method) => {
			await expect(write(storeWithProviderError(slotConflict), method, 'daily_assignments')).rejects.toMatchObject({
				status: 409,
				message: 'This assignment slot is unavailable. Refresh the Calendar and try again.'
			});
		}
	);

	it.each([
		['another table', 'personnel', slotConflict],
		[
			'another unique constraint',
			'daily_assignments',
			{
				...slotConflict,
				message: 'duplicate key value violates unique constraint "daily_assignments_pkey"'
			}
		],
		[
			'a similarly named constraint',
			'daily_assignments',
			{
				...slotConflict,
				message:
					'duplicate key value violates unique constraint "daily_assignments_clinic_id_assignment_type_id_date_key_other"'
			}
		],
		['another provider error code', 'daily_assignments', { ...slotConflict, code: '42501' }],
		[
			'an unrelated provider failure',
			'daily_assignments',
			{
				...slotConflict,
				code: 'PGRST000',
				message: 'Database connection unavailable'
			}
		]
	])('preserves existing errors for %s', async (_label, table, error) => {
		const result = write(storeWithProviderError(error), 'insert', table);
		await expect(result).rejects.toThrow(error.message);
		await expect(result).rejects.not.toHaveProperty('status');
	});
});
