import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabaseTrainingOnboardingReferencesPort } from './onboardingReferences.server';

type Row = Record<string, unknown>;

function provider(fixtures: { trainingTypes?: Row[]; trainingRecords?: Row[] } = {}) {
	const inCalls: Array<{ column: string; values: string[] }> = [];
	const from = vi.fn((table: string) => {
		let rows = (table === 'training_types' ? fixtures.trainingTypes : fixtures.trainingRecords) ?? [];
		let joinedPersonnel = false;
		let joinedType = false;
		const query = {
			select: (selection: string) => {
				joinedPersonnel = selection.includes('personnel!inner');
				joinedType = selection.includes('training_types!inner');
				return query;
			},
			eq: (column: string, value: unknown) => {
				rows = rows.filter((row) => valueAt(row, column) === value);
				return query;
			},
			in: (column: string, values: string[]) => {
				inCalls.push({ column, values });
				rows = rows.filter((row) => values.includes(valueAt(row, column) as string));
				return query;
			},
			order: () => query,
			range: (start: number, end: number) =>
				Promise.resolve({
					data: rows
						.filter(
							(row) => (!joinedPersonnel || row.personnel !== null) && (!joinedType || row.training_types !== null)
						)
						.sort((a, b) =>
							`${a.personnel_id ?? ''}:${a.training_type_id ?? ''}`.localeCompare(
								`${b.personnel_id ?? ''}:${b.training_type_id ?? ''}`
							)
						)
						.slice(start, end + 1),
					error: null
				})
		};
		return query;
	});
	const getAdminClient = vi.fn(() => ({ from }) as unknown as SupabaseClient);
	return { from, getAdminClient, inCalls, port: createSupabaseTrainingOnboardingReferencesPort(getAdminClient) };
}

function valueAt(row: Row, path: string): unknown {
	return path.split('.').reduce<unknown>((value, key) => (value as Row | null)?.[key], row);
}

function actor(onboarding: 'none' | 'view' = 'view', groupIds: string[] = ['alpha']) {
	return createTestAuthContext({
		orgId: 'org-1',
		role: 'member',
		isPrivileged: false,
		scopeSet: { kind: 'groups', groupIds },
		capabilityMap: {
			calendar: 'none',
			personnel: 'none',
			training: 'none',
			criticalTasks: 'none',
			onboarding,
			ratingScheme: 'none'
		}
	});
}

describe('Training references for Onboarding', () => {
	it('returns current Training type models to an Onboarding-only reader without exposing other Organizations', async () => {
		const { port } = provider({
			trainingTypes: [
				{ id: 'cpr', organization_id: 'org-1', name: 'CPR', sort_order: 1, expiration_months: 12 },
				{ id: 'other', organization_id: 'org-2', name: 'Other unit', sort_order: 2 }
			]
		});
		await expect(port.listTypes(actor())).resolves.toMatchObject([
			{ id: 'cpr', name: 'CPR', sortOrder: 1, expirationMonths: 12 }
		]);
	});

	it('returns only requested completion pairs for the actor Organization and Group, even if expired', async () => {
		const { port } = provider({
			trainingRecords: [
				{
					organization_id: 'org-1',
					personnel_id: 'p-alpha',
					training_type_id: 'cpr',
					expiration_date: '2025-01-01',
					personnel: { organization_id: 'org-1', group_id: 'alpha' },
					training_types: { organization_id: 'org-1' }
				},
				{
					organization_id: 'org-1',
					personnel_id: 'p-bravo',
					training_type_id: 'cpr',
					personnel: { organization_id: 'org-1', group_id: 'bravo' },
					training_types: { organization_id: 'org-1' }
				},
				{
					organization_id: 'org-2',
					personnel_id: 'p-other-org',
					training_type_id: 'cpr',
					personnel: { organization_id: 'org-2', group_id: 'alpha' },
					training_types: { organization_id: 'org-1' }
				},
				{
					organization_id: 'org-1',
					personnel_id: 'p-cross-ref',
					training_type_id: 'cpr',
					personnel: { organization_id: 'org-2', group_id: 'alpha' },
					training_types: { organization_id: 'org-1' }
				},
				{
					organization_id: 'org-1',
					personnel_id: 'p-cross-type',
					training_type_id: 'cpr',
					personnel: { organization_id: 'org-1', group_id: 'alpha' },
					training_types: { organization_id: 'org-2' }
				},
				{
					organization_id: 'org-1',
					personnel_id: 'p-alpha',
					training_type_id: 'first-aid',
					personnel: { organization_id: 'org-1', group_id: 'alpha' },
					training_types: { organization_id: 'org-1' }
				}
			]
		});
		const result = await port.completedTypeIds(
			actor(),
			['p-alpha', 'p-bravo', 'p-other-org', 'p-cross-ref', 'p-cross-type'],
			['cpr']
		);
		expect(result).toEqual(new Map([['p-alpha', new Set(['cpr'])]]));
	});

	it('denies missing Onboarding capability before opening the admin client', async () => {
		const { port, getAdminClient } = provider();
		await expect(port.listTypes(actor('none'))).rejects.toMatchObject({ status: 403 });
		await expect(port.completedTypeIds(actor('none'), ['p-alpha'], ['cpr'])).rejects.toMatchObject({
			status: 403
		});
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('returns no completions for empty Group scope or empty requests without opening the admin client', async () => {
		const { port, getAdminClient } = provider();
		await expect(port.completedTypeIds(actor('view', []), ['p-alpha'], ['cpr'])).resolves.toEqual(new Map());
		await expect(port.completedTypeIds(actor(), [], ['cpr'])).resolves.toEqual(new Map());
		await expect(port.completedTypeIds(actor(), ['p-alpha'], [])).resolves.toEqual(new Map());
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('pages completion records beyond the first provider page', async () => {
		const records = Array.from({ length: 501 }, (_, index) => ({
			organization_id: 'org-1',
			personnel_id: `p-${index % 100}`,
			training_type_id: `type-${Math.floor(index / 100)}`,
			personnel: { organization_id: 'org-1', group_id: 'alpha' },
			training_types: { organization_id: 'org-1' }
		}));
		const { port } = provider({ trainingRecords: records });
		const result = await port.completedTypeIds(
			actor(),
			records.map((record) => record.personnel_id),
			Array.from({ length: 6 }, (_, index) => `type-${index}`)
		);
		expect(result.size).toBe(100);
		expect(result.get('p-0')).toEqual(new Set(['type-0', 'type-1', 'type-2', 'type-3', 'type-4', 'type-5']));
	});

	it('chunks requested Personnel IDs while retaining completions across batches', async () => {
		const records = Array.from({ length: 201 }, (_, index) => ({
			organization_id: 'org-1',
			personnel_id: `p-${index}`,
			training_type_id: 'cpr',
			personnel: { organization_id: 'org-1', group_id: 'alpha' },
			training_types: { organization_id: 'org-1' }
		}));
		const { port, inCalls } = provider({ trainingRecords: records });
		const result = await port.completedTypeIds(
			actor(),
			records.map((row) => row.personnel_id),
			['cpr']
		);
		expect(result.size).toBe(201);
		expect(
			inCalls
				.filter((call) => call.column === 'personnel_id')
				.map((call) => call.values.length)
				.sort((a, b) => a - b)
		).toEqual([1, 100, 100]);
	});
});
