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

import { fetchSharedData } from './sharedData';
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
		vi.mocked(groupRepo.list).mockResolvedValue(mockGroups);
		vi.mocked(statusTypeRepo.list).mockResolvedValue(mockStatusTypes);
		vi.mocked(trainingTypeRepo.list).mockResolvedValue(mockTrainingTypes);
	});

	it('returns personnel, groups, statusTypes, trainingTypes without personnelTrainings', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null);

		expect(result).toHaveProperty('personnel');
		expect(result).toHaveProperty('allPersonnel');
		expect(result).toHaveProperty('groups');
		expect(result).toHaveProperty('statusTypes');
		expect(result).toHaveProperty('trainingTypes');
		expect(result).not.toHaveProperty('personnelTrainings');
		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
	});

	it('does not accept an include parameter', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		// fetchSharedData should only take 3 args now
		expect(fetchSharedData.length).toBe(3);
		await fetchSharedData(supabase, 'org1', null);
	});

	it('never calls personnelTrainingRepo', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null);

		expect(personnelTrainingRepo.list).not.toHaveBeenCalled();
	});

	it('personnel equals allPersonnel when no scoping', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', null);

		expect(result.personnel).toEqual(result.allPersonnel);
	});

	it('scopes personnel when scopedGroupId is set', async () => {
		vi.mocked(queryPersonnel)
			.mockResolvedValueOnce(mockQueryPersonnelResult(allPersonnel))
			.mockResolvedValueOnce(mockQueryPersonnelResult(scopedPersonnel));
		const supabase = mockSupabase();
		const result = await fetchSharedData(supabase, 'org1', 'g1');

		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');
		expect(result.allPersonnel).toHaveLength(2);
		expect(queryPersonnel).toHaveBeenCalledTimes(2);
		expect(queryPersonnel).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org1', scopedGroupId: 'g1' }));
	});

	it('delegates to repository modules', async () => {
		vi.mocked(queryPersonnel).mockResolvedValue(mockQueryPersonnelResult(allPersonnel));
		const supabase = mockSupabase();
		await fetchSharedData(supabase, 'org1', null);

		expect(groupRepo.list).toHaveBeenCalledWith(supabase, 'org1');
		expect(statusTypeRepo.list).toHaveBeenCalledWith(supabase, 'org1');
		expect(trainingTypeRepo.list).toHaveBeenCalledWith(supabase, 'org1');
	});
});
