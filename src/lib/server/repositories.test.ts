import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function createMockSupabase(
	responseData: Record<string, unknown>[] | null = [],
	responseError: null | { message: string } = null
) {
	const calls: Record<string, unknown[][]> = {};

	function record(method: string) {
		return (...args: unknown[]) => {
			calls[method] = calls[method] ?? [];
			calls[method].push(args);
			return builder;
		};
	}

	const builder: Record<string, unknown> = {
		select: record('select'),
		eq: record('eq'),
		is: record('is'),
		not: record('not'),
		order: record('order'),
		range: record('range'),
		in: record('in'),
		gte: record('gte'),
		lte: record('lte'),
		ilike: record('ilike'),
		then: undefined
	};

	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: responseError, count: responseData?.length ?? 0 });
		}
	});

	const supabase = {
		from: (table: string) => {
			calls['from'] = [[table]];
			return builder;
		},
		_calls: calls
	};

	return { supabase, calls };
}

describe('statusTypeRepo', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries status_types table with sort_order ordering and transforms correctly', async () => {
		const { statusTypeRepo } = await import('./repositories');
		const rows = [
			{ id: 'st1', name: 'Leave', color: '#48bb78', text_color: '#ffffff' },
			{ id: 'st2', name: 'TDY', color: '#9f7aea', text_color: '#ffffff' }
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await statusTypeRepo.list(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['status_types']);
		expect(calls['order']![0]).toEqual(['sort_order', { ascending: true }]);
		expect(result).toEqual([
			{ id: 'st1', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
			{ id: 'st2', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' }
		]);
	});
});

describe('trainingTypeRepo', () => {
	it('queries training_types table with sort_order ordering and transforms correctly', async () => {
		const { trainingTypeRepo } = await import('./repositories');
		const rows = [
			{
				id: 'tt1',
				name: 'CPR',
				description: 'CPR cert',
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				required_for_roles: ['medic'],
				color: '#3b82f6',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: true,
				exempt_personnel_ids: ['p1']
			}
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await trainingTypeRepo.list(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['training_types']);
		expect(calls['order']![0]).toEqual(['sort_order', { ascending: true }]);
		expect(result[0]).toMatchObject({
			id: 'tt1',
			name: 'CPR',
			expirationMonths: 12,
			warningDaysYellow: 60,
			warningDaysOrange: 30,
			requiredForRoles: ['medic'],
			sortOrder: 0,
			expirationDateOnly: false,
			canBeExempted: true,
			exemptPersonnelIds: ['p1']
		});
	});
});

describe('assignmentTypeRepo', () => {
	it('queries assignment_types table with sort_order ordering and transforms correctly', async () => {
		const { assignmentTypeRepo } = await import('./repositories');
		const rows = [
			{
				id: 'at1',
				name: 'CQ',
				short_name: 'CQ',
				assign_to: 'personnel',
				color: '#ef4444',
				exempt_personnel_ids: []
			}
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await assignmentTypeRepo.list(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['assignment_types']);
		expect(calls['order']![0]).toEqual(['sort_order', { ascending: true }]);
		expect(result[0]).toMatchObject({
			id: 'at1',
			name: 'CQ',
			shortName: 'CQ',
			assignTo: 'personnel',
			color: '#ef4444'
		});
	});
});

describe.skip('specialDayRepo — MIGRATED to SpecialDayEntity', () => {
	it('queries special_days table with date ordering and transforms correctly', async () => {
		// Test moved to src/lib/server/entities/specialDay.test.ts
	});
});

describe('availabilityRepo', () => {
	it('queries availability_entries table without ordering and transforms correctly', async () => {
		const { availabilityRepo } = await import('./repositories');
		const rows = [
			{
				id: 'a1',
				personnel_id: 'p1',
				status_type_id: 'st1',
				start_date: '2026-03-01',
				end_date: '2026-03-05',
				note: 'PTO'
			}
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await availabilityRepo.list(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['availability_entries']);
		expect(result[0]).toEqual({
			id: 'a1',
			personnelId: 'p1',
			statusTypeId: 'st1',
			startDate: '2026-03-01',
			endDate: '2026-03-05',
			note: 'PTO'
		});
	});
});

describe.skip('dailyAssignmentRepo — MIGRATED to DailyAssignmentEntity', () => {
	it('queries daily_assignments table without ordering and transforms correctly', async () => {
		// Test moved to src/lib/server/entities/dailyAssignment.test.ts
	});
});

describe.skip('rosterHistoryRepo — MIGRATED to RosterHistoryEntity', () => {
	it('queries duty_roster_history table with created_at desc ordering and transforms correctly', async () => {
		// Test moved to src/lib/server/entities/rosterHistory.test.ts
	});
});

describe.skip('personnelTrainingRepo — MIGRATED to PersonnelTrainingEntity', () => {
	it('queries personnel_trainings table without ordering and transforms correctly', async () => {
		// Test moved to src/lib/server/entities/personnelTraining.test.ts
	});
});

describe.skip('pinnedGroupRepo — MIGRATED to PinnedGroupsEntity', () => {
	it('queries user_pinned_groups table with sort_order ordering and transforms to group name strings', async () => {
		// Test moved to src/lib/server/entities/pinnedGroups.test.ts
	});
});

describe.skip('ratingSchemeRepo — MIGRATED to RatingSchemeEntryEntity', () => {
	it('queries rating_scheme_entries table with rating_period_end ordering and transforms correctly', async () => {
		// Test moved to src/lib/server/entities/ratingSchemeEntry.test.ts
	});
});
