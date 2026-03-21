import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Personnel } from '$lib/types';
import type { PersonnelQueryResult } from '$lib/server/personnelRepository';
import type { StatusType } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { Group } from '$lib/stores/groups.svelte';

vi.mock('$lib/server/personnelRepository', () => ({
	queryPersonnel: vi.fn(),
	personnelIds: vi.fn((p: Personnel[]) => p.map((x) => x.id))
}));

const mockGroups: Group[] = [
	{ id: 'g1', name: 'Alpha', sortOrder: 0 },
	{ id: 'g2', name: 'Bravo', sortOrder: 1 }
];

const mockStatusTypes: StatusType[] = [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' }];

const mockTrainingTypes: TrainingType[] = [
	{
		id: 'tt1',
		name: 'CPR',
		description: 'CPR cert',
		expirationMonths: 12,
		warningDaysYellow: 30,
		warningDaysOrange: 14,
		requiredForRoles: [],
		color: '#0f0',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: []
	}
];

const mockPersonnelTrainings: PersonnelTraining[] = [
	{
		id: 'pt1',
		personnelId: 'p1',
		trainingTypeId: 'tt1',
		completionDate: '2026-01-01',
		expirationDate: '2027-01-01',
		notes: '',
		certificateUrl: ''
	},
	{
		id: 'pt2',
		personnelId: 'p2',
		trainingTypeId: 'tt1',
		completionDate: '2026-02-01',
		expirationDate: '2027-02-01',
		notes: '',
		certificateUrl: ''
	}
];

vi.mock('$lib/server/repositories', () => ({
	groupRepo: {
		list: vi.fn(() => Promise.resolve(mockGroups)),
		query: vi.fn(),
		queryDateRange: vi.fn(),
		queryByIds: vi.fn()
	},
	statusTypeRepo: {
		list: vi.fn(() => Promise.resolve(mockStatusTypes)),
		query: vi.fn(),
		queryDateRange: vi.fn(),
		queryByIds: vi.fn()
	},
	trainingTypeRepo: {
		list: vi.fn(() => Promise.resolve(mockTrainingTypes)),
		query: vi.fn(),
		queryDateRange: vi.fn(),
		queryByIds: vi.fn()
	},
	personnelTrainingRepo: {
		list: vi.fn(() => Promise.resolve(mockPersonnelTrainings)),
		query: vi.fn(),
		queryDateRange: vi.fn(),
		queryByIds: vi.fn()
	}
}));

import { fetchSharedData, needsPersonnelTrainings } from './sharedData';
import { queryPersonnel } from '$lib/server/personnelRepository';
import { groupRepo, statusTypeRepo, trainingTypeRepo, personnelTrainingRepo } from '$lib/server/repositories';

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

// Supabase mock is still needed since repos call supabase internally,
// but sharedData no longer calls supabase.from() for status_types/training_types/personnel_trainings.
// The mock supabase is passed through to repos which are themselves mocked.
function mockSupabase() {
	return {} as Record<string, unknown>;
}

function mockQueryPersonnelResult(data: Personnel[]): PersonnelQueryResult {
	return { data, count: data.length, error: null };
}

describe('fetchSharedData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset repo mocks to default return values
		vi.mocked(groupRepo.list).mockResolvedValue(mockGroups);
		vi.mocked(statusTypeRepo.list).mockResolvedValue(mockStatusTypes);
		vi.mocked(trainingTypeRepo.list).mockResolvedValue(mockTrainingTypes);
		vi.mocked(personnelTrainingRepo.list).mockResolvedValue(mockPersonnelTrainings);
	});

	it('returns all expected fields when scopedGroupId is null', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
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
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null);

		expect(result.personnelTrainings).toEqual([]);
		expect(result.personnel).toHaveLength(2);
		expect(result.groups).toHaveLength(2);
	});

	it('returns empty personnelTrainings when include.personnelTrainings is false', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: false });

		expect(result.personnelTrainings).toEqual([]);
	});

	it('personnel equals allPersonnel when no scoping', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(result.personnel).toEqual(result.allPersonnel);
	});

	it('calls queryPersonnel with scopedGroupId for DB-level scoping', async () => {
		vi.mocked(queryPersonnel)
			.mockResolvedValueOnce(mockQueryPersonnelResult(allPersonnel))
			.mockResolvedValueOnce(mockQueryPersonnelResult(scopedPersonnel));
		const supabase = mockSupabase();
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
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1', { personnelTrainings: true });

		expect(result.personnelTrainings).toHaveLength(1);
		expect(result.personnelTrainings[0].personnelId).toBe('p1');
	});

	it('does not call personnelTrainingRepo when include is omitted', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null);

		expect(personnelTrainingRepo.list).not.toHaveBeenCalled();
	});

	it('calls personnelTrainingRepo when include.personnelTrainings is true', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(personnelTrainingRepo.list).toHaveBeenCalledWith(supabase, 'org1');
	});

	it('delegates to repository modules instead of calling supabase directly', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null, { personnelTrainings: true });

		expect(groupRepo.list).toHaveBeenCalledWith(supabase, 'org1');
		expect(statusTypeRepo.list).toHaveBeenCalledWith(supabase, 'org1');
		expect(trainingTypeRepo.list).toHaveBeenCalledWith(supabase, 'org1');
		expect(personnelTrainingRepo.list).toHaveBeenCalledWith(supabase, 'org1');
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
