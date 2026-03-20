import { describe, it, expect, vi } from 'vitest';
import { fetchSharedData, needsPersonnelTrainings } from './sharedData';

function mockSupabase(overrides: Record<string, unknown[]> = {}) {
	const defaults: Record<string, unknown[]> = {
		personnel: [
			{
				id: 'p1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Medic',
				group_id: 'g1',
				groups: { name: 'Alpha' },
				archived_at: null
			},
			{
				id: 'p2',
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Nurse',
				group_id: 'g2',
				groups: { name: 'Bravo' },
				archived_at: null
			}
		],
		groups: [
			{ id: 'g1', name: 'Alpha', sort_order: 0 },
			{ id: 'g2', name: 'Bravo', sort_order: 1 }
		],
		status_types: [{ id: 'st1', name: 'Leave', color: '#ff0', text_color: '#000' }],
		training_types: [
			{
				id: 'tt1',
				name: 'CPR',
				description: 'CPR cert',
				expiration_months: 12,
				warning_days_yellow: 30,
				warning_days_orange: 14,
				required_for_roles: [],
				color: '#0f0',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: []
			}
		],
		personnel_trainings: [
			{
				id: 'pt1',
				personnel_id: 'p1',
				training_type_id: 'tt1',
				completion_date: '2026-01-01',
				expiration_date: '2027-01-01',
				notes: '',
				certificate_url: ''
			},
			{
				id: 'pt2',
				personnel_id: 'p2',
				training_type_id: 'tt1',
				completion_date: '2026-02-01',
				expiration_date: '2027-02-01',
				notes: '',
				certificate_url: ''
			}
		]
	};

	const data = { ...defaults, ...overrides };

	const chainable = (table: string) => {
		const result = { data: data[table] ?? [], error: null };
		const chain: Record<string, unknown> = {};
		const methods = ['select', 'eq', 'is', 'order'];
		for (const m of methods) {
			chain[m] = vi.fn().mockReturnValue(chain);
		}
		// The last method call in any chain should resolve to the result
		for (const m of methods) {
			(chain[m] as ReturnType<typeof vi.fn>).mockReturnValue({ ...chain, ...result, then: undefined });
		}
		// Make the chain thenable so await works
		Object.defineProperty(chain, 'then', {
			value: (resolve: (v: unknown) => void) => resolve(result),
			configurable: true,
			writable: true
		});
		return chain;
	};

	return { from: vi.fn((table: string) => chainable(table)) };
}

describe('fetchSharedData', () => {
	it('returns all expected fields when scopedGroupId is null', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(result).toHaveProperty('personnel');
		expect(result).toHaveProperty('allPersonnel');
		expect(result).toHaveProperty('groups');
		expect(result).toHaveProperty('statusTypes');
		expect(result).toHaveProperty('trainingTypes');
		expect(result).toHaveProperty('personnelTrainings');
		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.groups).toHaveLength(2);
		expect(result.statusTypes).toHaveLength(1);
		expect(result.trainingTypes).toHaveLength(1);
		expect(result.personnelTrainings).toHaveLength(2);
	});

	it('returns empty personnelTrainings when include param is omitted', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null);

		expect(result.personnelTrainings).toEqual([]);
		expect(result.personnel).toHaveLength(2);
		expect(result.groups).toHaveLength(2);
	});

	it('returns empty personnelTrainings when include.personnelTrainings is false', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: false });

		expect(result.personnelTrainings).toEqual([]);
	});

	it('personnel equals allPersonnel when no scoping', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(result.personnel).toEqual(result.allPersonnel);
	});

	it('filters personnel to scoped group when scopedGroupId is set', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1', { personnelTrainings: true });

		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');
		expect(result.allPersonnel).toHaveLength(2);
	});

	it('filters personnelTrainings to scoped personnel when scopedGroupId is set', async () => {
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1', { personnelTrainings: true });

		expect(result.personnelTrainings).toHaveLength(1);
		expect(result.personnelTrainings[0].personnelId).toBe('p1');
	});

	it('does not query personnel_trainings table when include is omitted', async () => {
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null);

		const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
		expect(fromCalls).not.toContain('personnel_trainings');
	});

	it('queries personnel_trainings table when include.personnelTrainings is true', async () => {
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
		expect(fromCalls).toContain('personnel_trainings');
	});
});

describe('needsPersonnelTrainings', () => {
	const orgId = 'org-abc-123';

	it('returns true for dashboard, training, and onboarding routes', () => {
		expect(needsPersonnelTrainings(`/org/${orgId}`, orgId)).toBe(true);
		expect(needsPersonnelTrainings(`/org/${orgId}/training`, orgId)).toBe(true);
		expect(needsPersonnelTrainings(`/org/${orgId}/training/some-sub`, orgId)).toBe(true);
		expect(needsPersonnelTrainings(`/org/${orgId}/onboarding`, orgId)).toBe(true);
	});

	it('returns false for calendar, personnel, leaders-book, and admin routes', () => {
		expect(needsPersonnelTrainings(`/org/${orgId}/calendar`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/personnel`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/leaders-book`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/admin`, orgId)).toBe(false);
	});

	it('returns false for unknown routes (safe default)', () => {
		expect(needsPersonnelTrainings(`/org/${orgId}/settings`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/billing`, orgId)).toBe(false);
	});
});
