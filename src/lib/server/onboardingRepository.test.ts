import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';

// Spy on entity fromDbArray methods to verify they are called by the repository
const mockTemplateFromDbArray = vi.spyOn(OnboardingTemplateEntity, 'fromDbArray');
const mockStepFromDbArray = vi.spyOn(OnboardingTemplateStepEntity, 'fromDbArray');
const mockOnboardingFromDbArray = vi.spyOn(PersonnelOnboardingEntity, 'fromDbArray');

import { findTemplates, findTemplateSteps, findOnboardings, countTemplateSteps } from './onboardingRepository';

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
		order: record('order'),
		in: record('in'),
		gte: record('gte'),
		lte: record('lte'),
		ilike: record('ilike')
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

describe('findTemplates', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries onboarding_templates with org scoping and name ordering', async () => {
		const rows = [{ id: 't1', organization_id: ORG_ID, name: 'Alpha', description: null, created_at: '2026-01-01' }];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await findTemplates(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['onboarding_templates']);
		expect(calls['select']![0]).toEqual(['*']);
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		expect(calls['order']![0]).toEqual(['name']);
		expect(result.data).toHaveLength(1);
		expect(result.error).toBeNull();
		expect(mockTemplateFromDbArray).toHaveBeenCalledWith(rows);
	});

	it('returns empty data and error message on Supabase error', async () => {
		const { supabase } = createMockSupabase(null, { message: 'DB error' });

		const result = await findTemplates(supabase, ORG_ID);

		expect(result.data).toEqual([]);
		expect(result.error).toBe('DB error');
	});
});

describe('findTemplateSteps', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries onboarding_template_steps with org scoping and sort_order ordering', async () => {
		const rows = [{ id: 's1', template_id: 't1', name: 'Step 1', sort_order: 0 }];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await findTemplateSteps(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['onboarding_template_steps']);
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		expect(calls['order']![0]).toEqual(['sort_order']);
		expect(result.data).toHaveLength(1);
		expect(result.error).toBeNull();
		expect(mockStepFromDbArray).toHaveBeenCalledWith(rows);
	});
});

describe('findOnboardings', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries personnel_onboardings with join to step progress, ordered by created_at desc', async () => {
		const rows = [
			{
				id: 'o1',
				personnel_id: 'p1',
				started_at: '2026-01-10',
				completed_at: null,
				status: 'in_progress',
				template_id: 't1',
				onboarding_step_progress: []
			}
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await findOnboardings(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['personnel_onboardings']);
		expect(calls['select']![0]).toEqual(['*, onboarding_step_progress(*)']);
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		expect(calls['order']![0]).toEqual(['created_at', { ascending: false }]);
		expect(result.data).toHaveLength(1);
		expect(result.error).toBeNull();
		expect(mockOnboardingFromDbArray).toHaveBeenCalledWith(rows);
	});

	it('filters onboardings to scoped personnel IDs when provided', async () => {
		const rows = [
			{
				id: 'o1',
				personnel_id: 'p1',
				started_at: '2026-01-10',
				completed_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: []
			},
			{
				id: 'o2',
				personnel_id: 'p2',
				started_at: '2026-01-11',
				completed_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: []
			}
		];
		const { supabase } = createMockSupabase(rows);
		const scopedIds = new Set(['p1']);

		const result = await findOnboardings(supabase, ORG_ID, scopedIds);

		// Transform should only receive the filtered rows
		expect(mockOnboardingFromDbArray).toHaveBeenCalledWith([rows[0]]);
		expect(result.data).toHaveLength(1);
	});
});

describe('countTemplateSteps', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns count of template steps for an org', async () => {
		const { supabase, calls } = createMockSupabase([{ id: 's1' }, { id: 's2' }]);

		const result = await countTemplateSteps(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['onboarding_template_steps']);
		expect(calls['select']![0]).toEqual(['id', { count: 'exact', head: true }]);
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		expect(result).toBe(2);
	});
});
