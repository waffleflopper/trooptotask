import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Personnel } from '$lib/types';
import type { PersonnelQueryResult } from '$lib/server/personnelRepository';

vi.mock('$lib/server/personnelRepository', () => ({
	queryPersonnel: vi.fn(),
	personnelIds: vi.fn((p: Personnel[]) => p.map((x) => x.id))
}));

vi.mock('$lib/server/transforms', () => ({
	transformGroups: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sort_order }))
	),
	transformStatusTypes: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((s) => ({ id: s.id, name: s.name, color: s.color, textColor: s.text_color }))
	),
	transformTrainingTypes: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((t) => ({
			id: t.id,
			name: t.name,
			description: t.description,
			expirationMonths: t.expiration_months,
			warningDaysYellow: t.warning_days_yellow,
			warningDaysOrange: t.warning_days_orange,
			requiredForRoles: t.required_for_roles ?? [],
			color: t.color,
			sortOrder: t.sort_order,
			expirationDateOnly: t.expiration_date_only ?? false,
			canBeExempted: t.can_be_exempted ?? false,
			exemptPersonnelIds: t.exempt_personnel_ids ?? []
		}))
	),
	transformPersonnelTrainings: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((t) => ({
			id: t.id,
			personnelId: t.personnel_id,
			trainingTypeId: t.training_type_id,
			completionDate: t.completion_date,
			expirationDate: t.expiration_date,
			notes: t.notes,
			certificateUrl: t.certificate_url
		}))
	)
}));

import { fetchSharedData, needsPersonnelTrainings } from './sharedData';
import { queryPersonnel } from '$lib/server/personnelRepository';

const allPersonnel: Personnel[] = [
	{
		id: 'p1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'Medic',
		groupId: 'g1',
		groupName: 'Alpha'
	},
	{
		id: 'p2',
		rank: 'CPL',
		lastName: 'Jones',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Nurse',
		groupId: 'g2',
		groupName: 'Bravo'
	}
];

const scopedPersonnel: Personnel[] = [allPersonnel[0]];

function mockTableSupabase(overrides: Record<string, unknown[]> = {}) {
	const defaults: Record<string, unknown[]> = {
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
		for (const m of methods) {
			(chain[m] as ReturnType<typeof vi.fn>).mockReturnValue({ ...chain, ...result, then: undefined });
		}
		Object.defineProperty(chain, 'then', {
			value: (resolve: (v: unknown) => void) => resolve(result),
			configurable: true,
			writable: true
		});
		return chain;
	};

	return { from: vi.fn((table: string) => chainable(table)) };
}

function mockQueryPersonnelResult(data: Personnel[]): PersonnelQueryResult {
	return { data, count: data.length, error: null };
}

describe('fetchSharedData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns all expected fields when scopedGroupId is null', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
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
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		const result = await fetchSharedData(supabase, 'org1', null);

		expect(result.personnelTrainings).toEqual([]);
		expect(result.personnel).toHaveLength(2);
		expect(result.groups).toHaveLength(2);
	});

	it('returns empty personnelTrainings when include.personnelTrainings is false', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: false });

		expect(result.personnelTrainings).toEqual([]);
	});

	it('personnel equals allPersonnel when no scoping', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(result.personnel).toEqual(result.allPersonnel);
	});

	it('calls queryPersonnel with scopedGroupId for DB-level scoping', async () => {
		vi.mocked(queryPersonnel)
			.mockResolvedValueOnce(mockQueryPersonnelResult(allPersonnel))
			.mockResolvedValueOnce(mockQueryPersonnelResult(scopedPersonnel));
		const supabase = mockTableSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1', { personnelTrainings: true });

		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');
		expect(result.allPersonnel).toHaveLength(2);
		// Verify queryPersonnel was called twice: once unscoped, once scoped
		expect(queryPersonnel).toHaveBeenCalledTimes(2);
		expect(queryPersonnel).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org1', scopedGroupId: 'g1' }));
	});

	it('filters personnelTrainings to scoped personnel when scopedGroupId is set', async () => {
		vi.mocked(queryPersonnel)
			.mockResolvedValueOnce(mockQueryPersonnelResult(allPersonnel))
			.mockResolvedValueOnce(mockQueryPersonnelResult(scopedPersonnel));
		const supabase = mockTableSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1', { personnelTrainings: true });

		expect(result.personnelTrainings).toHaveLength(1);
		expect(result.personnelTrainings[0].personnelId).toBe('p1');
	});

	it('does not query personnel_trainings table when include is omitted', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		await fetchSharedData(supabase, 'org1', null);

		const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
		expect(fromCalls).not.toContain('personnel_trainings');
	});

	it('queries personnel_trainings table when include.personnelTrainings is true', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
		expect(fromCalls).toContain('personnel_trainings');
	});

	it('does not call supabase.from("personnel") directly — uses queryPersonnel instead', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockTableSupabase();
		await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		const fromCalls = supabase.from.mock.calls.map((c: string[]) => c[0]);
		expect(fromCalls).not.toContain('personnel');
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

	it('returns false for calendar, personnel, and admin routes', () => {
		expect(needsPersonnelTrainings(`/org/${orgId}/calendar`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/personnel`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/admin`, orgId)).toBe(false);
	});

	it('returns false for unknown routes (safe default)', () => {
		expect(needsPersonnelTrainings(`/org/${orgId}/settings`, orgId)).toBe(false);
		expect(needsPersonnelTrainings(`/org/${orgId}/billing`, orgId)).toBe(false);
	});
});
