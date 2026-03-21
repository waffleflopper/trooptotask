import { describe, it, expect } from 'vitest';
import { OnboardingTemplateStepEntity } from './onboardingTemplateStep';
import type { OnboardingTemplateStep } from '$features/onboarding/onboarding.types';

describe('OnboardingTemplateStepEntity', () => {
	it('table is onboarding_template_steps', () => {
		expect(OnboardingTemplateStepEntity.table).toBe('onboarding_template_steps');
	});

	it('groupScope is none', () => {
		expect(OnboardingTemplateStepEntity.groupScope).toBe('none');
	});

	it('fromDb produces correct OnboardingTemplateStep shape', () => {
		const row = {
			id: 'ts-1',
			template_id: 't-1',
			name: 'Complete PT Test',
			description: 'Physical fitness assessment',
			step_type: 'training',
			training_type_id: 'tt-1',
			stages: ['stage1', 'stage2'],
			sort_order: 1
		};

		const result = OnboardingTemplateStepEntity.fromDb(row) as OnboardingTemplateStep;

		expect(result).toEqual({
			id: 'ts-1',
			templateId: 't-1',
			name: 'Complete PT Test',
			description: 'Physical fitness assessment',
			stepType: 'training',
			trainingTypeId: 'tt-1',
			stages: ['stage1', 'stage2'],
			sortOrder: 1
		});
	});

	it('fromDb handles null optional fields', () => {
		const row = {
			id: 'ts-2',
			template_id: 't-1',
			name: 'Sign Form',
			description: null,
			step_type: 'paperwork',
			training_type_id: null,
			stages: null,
			sort_order: 0
		};

		const result = OnboardingTemplateStepEntity.fromDb(row) as OnboardingTemplateStep;

		expect(result.description).toBeNull();
		expect(result.trainingTypeId).toBeNull();
		expect(result.stages).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'ts-1',
				template_id: 't-1',
				name: 'Step A',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			},
			{
				id: 'ts-2',
				template_id: 't-1',
				name: 'Step B',
				description: 'Do this',
				step_type: 'training',
				training_type_id: 'tt-1',
				stages: ['s1'],
				sort_order: 1
			}
		];

		const results = OnboardingTemplateStepEntity.fromDbArray(rows) as OnboardingTemplateStep[];

		expect(results).toHaveLength(2);
		expect(results[0].name).toBe('Step A');
		expect(results[1].trainingTypeId).toBe('tt-1');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = OnboardingTemplateStepEntity.toDbInsert(
			{
				templateId: 't-1',
				name: 'New Step',
				stepType: 'checkbox',
				sortOrder: 2
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			template_id: 't-1',
			name: 'New Step',
			step_type: 'checkbox',
			sort_order: 2,
			description: null,
			training_type_id: null,
			stages: null
		});
	});

	it('toDbInsert applies defaults for optional fields', () => {
		const result = OnboardingTemplateStepEntity.toDbInsert(
			{
				templateId: 't-1',
				name: 'Minimal Step',
				stepType: 'paperwork'
			},
			'org-1'
		);

		expect(result.description).toBeNull();
		expect(result.training_type_id).toBeNull();
		expect(result.stages).toBeNull();
		expect(result.sort_order).toBe(0);
	});

	it('toDbUpdate maps camelCase to snake_case and excludes id', () => {
		const result = OnboardingTemplateStepEntity.toDbUpdate({
			id: 'ts-1',
			name: 'Updated Step',
			sortOrder: 5
		});

		expect(result).toEqual({ name: 'Updated Step', sort_order: 5 });
		expect(result).not.toHaveProperty('id');
	});

	it('createSchema requires templateId, name, stepType', () => {
		const valid = OnboardingTemplateStepEntity.createSchema.safeParse({
			templateId: 't-1',
			name: 'Test Step',
			stepType: 'checkbox'
		});
		expect(valid.success).toBe(true);

		const missing = OnboardingTemplateStepEntity.createSchema.safeParse({
			name: 'Test Step'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema validates stepType enum', () => {
		const valid = OnboardingTemplateStepEntity.createSchema.safeParse({
			templateId: 't-1',
			name: 'Test',
			stepType: 'training'
		});
		expect(valid.success).toBe(true);

		const invalid = OnboardingTemplateStepEntity.createSchema.safeParse({
			templateId: 't-1',
			name: 'Test',
			stepType: 'invalid'
		});
		expect(invalid.success).toBe(false);
	});
});
