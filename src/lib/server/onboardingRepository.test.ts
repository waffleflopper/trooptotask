import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	transformOnboardingTemplates,
	transformOnboardingTemplateSteps,
	transformPersonnelOnboardings
} from '$lib/server/transforms';

vi.mock('$lib/server/transforms', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		transformOnboardingTemplates: vi.fn(actual.transformOnboardingTemplates as (...args: unknown[]) => unknown),
		transformOnboardingTemplateSteps: vi.fn(actual.transformOnboardingTemplateSteps as (...args: unknown[]) => unknown),
		transformPersonnelOnboardings: vi.fn(actual.transformPersonnelOnboardings as (...args: unknown[]) => unknown)
	};
});

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

describe('transformOnboardingTemplates', () => {
	it('maps DB rows to OnboardingTemplate objects with camelCase keys', () => {
		const rows = [
			{
				id: 't1',
				organization_id: 'org-1',
				name: 'New Hire',
				description: 'Onboarding for new hires',
				created_at: '2026-01-15T00:00:00Z'
			}
		];

		const result = transformOnboardingTemplates(rows);

		expect(result).toEqual([
			{
				id: 't1',
				orgId: 'org-1',
				name: 'New Hire',
				description: 'Onboarding for new hires',
				createdAt: '2026-01-15T00:00:00Z'
			}
		]);
	});

	it('handles null description', () => {
		const rows = [
			{
				id: 't1',
				organization_id: 'org-1',
				name: 'Quick Start',
				description: null,
				created_at: '2026-01-15T00:00:00Z'
			}
		];

		const result = transformOnboardingTemplates(rows);

		expect(result[0].description).toBeNull();
	});
});

describe('transformOnboardingTemplateSteps', () => {
	it('maps DB rows to OnboardingTemplateStep objects', () => {
		const rows = [
			{
				id: 's1',
				template_id: 't1',
				name: 'Complete paperwork',
				description: 'Fill out all forms',
				step_type: 'paperwork',
				training_type_id: null,
				stages: null,
				sort_order: 0
			},
			{
				id: 's2',
				template_id: 't1',
				name: 'CPR Training',
				description: null,
				step_type: 'training',
				training_type_id: 'tt-1',
				stages: ['classroom', 'practical'],
				sort_order: 1
			}
		];

		const result = transformOnboardingTemplateSteps(rows);

		expect(result).toEqual([
			{
				id: 's1',
				templateId: 't1',
				name: 'Complete paperwork',
				description: 'Fill out all forms',
				stepType: 'paperwork',
				trainingTypeId: null,
				stages: null,
				sortOrder: 0
			},
			{
				id: 's2',
				templateId: 't1',
				name: 'CPR Training',
				description: null,
				stepType: 'training',
				trainingTypeId: 'tt-1',
				stages: ['classroom', 'practical'],
				sortOrder: 1
			}
		]);
	});
});

describe('transformPersonnelOnboardings', () => {
	it('maps DB rows with nested step progress, sorting steps by sort_order', () => {
		const rows = [
			{
				id: 'o1',
				personnel_id: 'p1',
				started_at: '2026-01-10T00:00:00Z',
				completed_at: null,
				status: 'in_progress',
				template_id: 't1',
				onboarding_step_progress: [
					{
						id: 'sp2',
						onboarding_id: 'o1',
						step_name: 'CPR Training',
						step_type: 'training',
						training_type_id: 'tt-1',
						stages: ['classroom', 'practical'],
						sort_order: 1,
						completed: false,
						current_stage: 'classroom',
						notes: [{ text: 'Started', timestamp: '2026-01-11T00:00:00Z' }],
						template_step_id: 's2'
					},
					{
						id: 'sp1',
						onboarding_id: 'o1',
						step_name: 'Paperwork',
						step_type: 'paperwork',
						training_type_id: null,
						stages: null,
						sort_order: 0,
						completed: true,
						current_stage: null,
						notes: [],
						template_step_id: 's1'
					}
				]
			}
		];

		const result = transformPersonnelOnboardings(rows);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('o1');
		expect(result[0].personnelId).toBe('p1');
		expect(result[0].status).toBe('in_progress');
		expect(result[0].templateId).toBe('t1');
		// Steps should be sorted by sortOrder (0 before 1)
		expect(result[0].steps[0].stepName).toBe('Paperwork');
		expect(result[0].steps[0].sortOrder).toBe(0);
		expect(result[0].steps[1].stepName).toBe('CPR Training');
		expect(result[0].steps[1].sortOrder).toBe(1);
	});

	it('handles missing onboarding_step_progress gracefully', () => {
		const rows = [
			{
				id: 'o1',
				personnel_id: 'p1',
				started_at: '2026-01-10T00:00:00Z',
				completed_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: null
			}
		];

		const result = transformPersonnelOnboardings(rows);

		expect(result[0].steps).toEqual([]);
		expect(result[0].templateId).toBeNull();
	});

	it('handles non-array notes by defaulting to empty array', () => {
		const rows = [
			{
				id: 'o1',
				personnel_id: 'p1',
				started_at: '2026-01-10T00:00:00Z',
				completed_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: [
					{
						id: 'sp1',
						onboarding_id: 'o1',
						step_name: 'Step',
						step_type: 'checkbox',
						training_type_id: null,
						stages: null,
						sort_order: 0,
						completed: false,
						current_stage: null,
						notes: 'not-an-array',
						template_step_id: null
					}
				]
			}
		];

		const result = transformPersonnelOnboardings(rows);

		expect(result[0].steps[0].notes).toEqual([]);
	});
});

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
		expect(transformOnboardingTemplates).toHaveBeenCalledWith(rows);
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
		expect(transformOnboardingTemplateSteps).toHaveBeenCalledWith(rows);
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
		expect(transformPersonnelOnboardings).toHaveBeenCalledWith(rows);
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
		expect(transformPersonnelOnboardings).toHaveBeenCalledWith([rows[0]]);
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
