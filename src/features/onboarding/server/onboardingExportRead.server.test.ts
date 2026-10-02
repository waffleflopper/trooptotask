import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { listPersonnelOnboardingExportRows, listOnboardingStepProgressExportRows } from './onboardingExportRead.server';

const ORG = 'owned-org';
const readers = [
	['personnel_onboardings', listPersonnelOnboardingExportRows],
	['onboarding_step_progress', listOnboardingStepProgressExportRows]
] as const;

describe('Onboarding raw export reads', () => {
	it('retains saved packet and progress fields, including inactive work, without foreign organization rows', async () => {
		const store = createInMemoryDataStore();
		const packet = {
			id: 'saved-packet',
			organization_id: ORG,
			personnel_id: 'archived-person',
			template_id: null,
			status: 'cancelled',
			started_at: '2026-05-01',
			completed_at: null,
			cancelled_at: '2026-09-29T01:02:03.654321Z',
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z',
			retained_extra: { source: 'packet' }
		};
		const progress = {
			id: 'saved-work',
			organization_id: ORG,
			onboarding_id: 'saved-packet',
			template_step_id: null,
			step_name: 'Saved paperwork',
			step_type: 'paperwork',
			training_type_id: null,
			stages: ['Submitted', 'Filed'],
			current_stage: 'Retired stage',
			sort_order: 3,
			completed: true,
			active: false,
			notes: [{ text: 'Retained work', timestamp: '2026-09-29T01:02:03.654321Z', userId: 'saved-author' }],
			created_at: '2026-05-01T00:00:00.123456Z',
			updated_at: '2026-09-29T01:02:03.654321Z',
			retained_extra: 'progress'
		};
		store.seed('personnel_onboardings', [packet, { ...packet, id: 'foreign-packet', organization_id: 'foreign-org' }]);
		store.seed('onboarding_step_progress', [
			progress,
			{ ...progress, id: 'foreign-work', organization_id: 'foreign-org' }
		]);

		expect(await listPersonnelOnboardingExportRows(store, ORG)).toEqual([packet]);
		expect(await listOnboardingStepProgressExportRows(store, ORG)).toEqual([progress]);
	});

	it('returns empty sections when there are no saved rows in the requested organization', async () => {
		const store = createInMemoryDataStore();
		for (const [table, read] of readers) {
			store.seed(table, [{ id: 'foreign-row', organization_id: 'foreign-org' }]);
			expect(await read(store, ORG)).toEqual([]);
		}
	});

	it.each(readers)('retains %s rows beyond the provider page and rejects a late read failure', async (table, read) => {
		const owned = Array.from({ length: 1001 }, (_, index) => ({
			id: `saved-${index}`,
			organization_id: ORG,
			retained_extra: { sequence: index }
		}));
		const rows = [...owned, { id: 'foreign-row', organization_id: 'foreign-org', retained_extra: { sequence: 1001 } }];
		let failLaterPage = false;
		const client = createClient('http://127.0.0.1:9', 'synthetic-request-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					if (url.pathname.split('/').at(-1) !== table) throw new Error('Unexpected Onboarding export table');
					const offset = Number(url.searchParams.get('offset') ?? 0);
					if (failLaterPage && offset >= 1000) {
						return Response.json({ code: '42501', message: 'Saved Onboarding rows unavailable' }, { status: 403 });
					}
					const visible = rows.filter(
						(row) =>
							!url.searchParams.has('organization_id') ||
							url.searchParams.get('organization_id') === `eq.${row.organization_id}`
					);
					const limit = Number(url.searchParams.get('limit') ?? 1000);
					const selection = url.searchParams.get('select');
					return Response.json(
						visible
							.slice(offset, offset + Math.min(limit, 1000))
							.map((row) =>
								!selection || selection === '*'
									? row
									: Object.fromEntries(selection.split(',').map((column) => [column, row[column as keyof typeof row]]))
							)
					);
				}
			}
		});
		const store = createSupabaseDataStore(client);

		expect(await read(store, ORG)).toEqual(owned);
		failLaterPage = true;
		await expect(read(store, ORG)).rejects.toThrow('Saved Onboarding rows unavailable');
	});
});
