import { describe, it, expect } from 'vitest';
import { PersonnelOnboardingEntity } from './personnelOnboarding';
import type { PersonnelOnboarding } from '$features/onboarding/onboarding.types';

describe('PersonnelOnboardingEntity', () => {
	it('table is personnel_onboardings', () => {
		expect(PersonnelOnboardingEntity.table).toBe('personnel_onboardings');
	});

	it('groupScope is none', () => {
		expect(PersonnelOnboardingEntity.groupScope).toBe('none');
	});

	it('fromDb produces correct PersonnelOnboarding shape with empty steps', () => {
		const row = {
			id: 'o-1',
			personnel_id: 'p-1',
			started_at: '2026-01-01',
			completed_at: null,
			status: 'in_progress',
			template_id: 't-1',
			onboarding_step_progress: []
		};

		const result = PersonnelOnboardingEntity.fromDb(row) as PersonnelOnboarding;

		expect(result).toEqual({
			id: 'o-1',
			personnelId: 'p-1',
			startedAt: '2026-01-01',
			completedAt: null,
			cancelledAt: null,
			status: 'in_progress',
			templateId: 't-1',
			steps: []
		});
	});

	it('fromDb handles nested step progress with sorting', () => {
		const row = {
			id: 'o-1',
			personnel_id: 'p-1',
			started_at: '2026-01-01',
			completed_at: null,
			status: 'in_progress',
			template_id: 't-1',
			onboarding_step_progress: [
				{
					id: 's-2',
					onboarding_id: 'o-1',
					step_name: 'Step B',
					step_type: 'checkbox',
					training_type_id: null,
					stages: null,
					sort_order: 2,
					completed: false,
					current_stage: null,
					notes: [],
					template_step_id: null
				},
				{
					id: 's-1',
					onboarding_id: 'o-1',
					step_name: 'Step A',
					step_type: 'training',
					training_type_id: 'tt-1',
					stages: ['stage1'],
					sort_order: 1,
					completed: true,
					current_stage: 'stage1',
					notes: [{ text: 'done', timestamp: '2026-01-02' }],
					template_step_id: 'ts-1'
				}
			]
		};

		const result = PersonnelOnboardingEntity.fromDb(row) as PersonnelOnboarding;

		// Steps should be sorted by sort_order
		expect(result.steps[0].stepName).toBe('Step A');
		expect(result.steps[1].stepName).toBe('Step B');

		// Verify first step (sort_order 1)
		expect(result.steps[0]).toEqual({
			id: 's-1',
			onboardingId: 'o-1',
			stepName: 'Step A',
			stepType: 'training',
			trainingTypeId: 'tt-1',
			stages: ['stage1'],
			sortOrder: 1,
			completed: true,
			currentStage: 'stage1',
			notes: [{ text: 'done', timestamp: '2026-01-02' }],
			templateStepId: 'ts-1',
			active: true
		});

		// Verify second step (sort_order 2)
		expect(result.steps[1]).toEqual({
			id: 's-2',
			onboardingId: 'o-1',
			stepName: 'Step B',
			stepType: 'checkbox',
			trainingTypeId: null,
			stages: null,
			sortOrder: 2,
			completed: false,
			currentStage: null,
			notes: [],
			templateStepId: null,
			active: true
		});
	});

	it('fromDb handles null onboarding_step_progress', () => {
		const row = {
			id: 'o-2',
			personnel_id: 'p-2',
			started_at: '2026-02-01',
			completed_at: '2026-02-15',
			status: 'completed',
			template_id: null,
			onboarding_step_progress: null
		};

		const result = PersonnelOnboardingEntity.fromDb(row) as PersonnelOnboarding;

		expect(result.steps).toEqual([]);
		expect(result.completedAt).toBe('2026-02-15');
		expect(result.templateId).toBeNull();
	});

	it('fromDb handles non-array notes in step progress', () => {
		const row = {
			id: 'o-3',
			personnel_id: 'p-3',
			started_at: '2026-03-01',
			completed_at: null,
			status: 'in_progress',
			template_id: null,
			onboarding_step_progress: [
				{
					id: 's-3',
					onboarding_id: 'o-3',
					step_name: 'Step with bad notes',
					step_type: 'paperwork',
					training_type_id: null,
					stages: null,
					sort_order: 0,
					completed: false,
					current_stage: null,
					notes: 'not-an-array',
					template_step_id: null
				}
			]
		};

		const result = PersonnelOnboardingEntity.fromDb(row) as PersonnelOnboarding;

		// Non-array notes should become empty array
		expect(result.steps[0].notes).toEqual([]);
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'o-1',
				personnel_id: 'p-1',
				started_at: '2026-01-01',
				completed_at: null,
				status: 'in_progress',
				template_id: 't-1',
				onboarding_step_progress: []
			},
			{
				id: 'o-2',
				personnel_id: 'p-2',
				started_at: '2026-02-01',
				completed_at: '2026-02-15',
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			}
		];

		const results = PersonnelOnboardingEntity.fromDbArray(rows) as PersonnelOnboarding[];

		expect(results).toHaveLength(2);
		expect(results[0].personnelId).toBe('p-1');
		expect(results[1].status).toBe('completed');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = PersonnelOnboardingEntity.toDbInsert(
			{
				personnelId: 'p-1',
				startedAt: '2026-01-01',
				status: 'in_progress'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'p-1',
			started_at: '2026-01-01',
			status: 'in_progress',
			completed_at: null,
			cancelled_at: null,
			template_id: null
		});
	});

	it('toDbInsert applies defaults for optional fields', () => {
		const result = PersonnelOnboardingEntity.toDbInsert(
			{
				personnelId: 'p-1',
				startedAt: '2026-01-01',
				status: 'in_progress'
			},
			'org-1'
		);

		expect(result.completed_at).toBeNull();
		expect(result.template_id).toBeNull();
	});

	it('toDbUpdate maps camelCase to snake_case and excludes id', () => {
		const result = PersonnelOnboardingEntity.toDbUpdate({
			id: 'o-1',
			status: 'completed',
			completedAt: '2026-02-15'
		});

		expect(result).toEqual({
			status: 'completed',
			completed_at: '2026-02-15'
		});
		expect(result).not.toHaveProperty('id');
	});

	it('createSchema requires personnelId, startedAt, status', () => {
		const valid = PersonnelOnboardingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			startedAt: '2026-01-01',
			status: 'in_progress'
		});
		expect(valid.success).toBe(true);

		const missing = PersonnelOnboardingEntity.createSchema.safeParse({
			personnelId: 'p-1'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema validates status enum', () => {
		const valid = PersonnelOnboardingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			startedAt: '2026-01-01',
			status: 'completed'
		});
		expect(valid.success).toBe(true);

		const invalid = PersonnelOnboardingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			startedAt: '2026-01-01',
			status: 'invalid_status'
		});
		expect(invalid.success).toBe(false);
	});
});
