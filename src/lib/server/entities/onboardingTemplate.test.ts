import { describe, it, expect } from 'vitest';
import { OnboardingTemplateEntity } from './onboardingTemplate';
import type { OnboardingTemplate } from '$features/onboarding/onboarding.types';

describe('OnboardingTemplateEntity', () => {
	it('table is onboarding_templates', () => {
		expect(OnboardingTemplateEntity.table).toBe('onboarding_templates');
	});

	it('groupScope is none', () => {
		expect(OnboardingTemplateEntity.groupScope).toBe('none');
	});

	it('fromDb produces correct OnboardingTemplate shape', () => {
		const row = {
			id: 't-1',
			organization_id: 'org-1',
			name: 'Basic Training',
			description: 'Onboarding for new recruits',
			created_at: '2026-01-01T00:00:00Z'
		};

		const result = OnboardingTemplateEntity.fromDb(row) as OnboardingTemplate;

		expect(result).toEqual({
			id: 't-1',
			orgId: 'org-1',
			name: 'Basic Training',
			description: 'Onboarding for new recruits',
			createdAt: '2026-01-01T00:00:00Z'
		});
	});

	it('fromDb handles null description', () => {
		const row = {
			id: 't-2',
			organization_id: 'org-1',
			name: 'Quick Start',
			description: null,
			created_at: '2026-02-01T00:00:00Z'
		};

		const result = OnboardingTemplateEntity.fromDb(row) as OnboardingTemplate;

		expect(result.description).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 't-1',
				organization_id: 'org-1',
				name: 'Basic',
				description: null,
				created_at: '2026-01-01T00:00:00Z'
			},
			{
				id: 't-2',
				organization_id: 'org-1',
				name: 'Advanced',
				description: 'For experienced staff',
				created_at: '2026-02-01T00:00:00Z'
			}
		];

		const results = OnboardingTemplateEntity.fromDbArray(rows) as OnboardingTemplate[];

		expect(results).toHaveLength(2);
		expect(results[0].name).toBe('Basic');
		expect(results[1].description).toBe('For experienced staff');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = OnboardingTemplateEntity.toDbInsert(
			{
				name: 'New Template',
				description: 'A description'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'New Template',
			description: 'A description'
		});
	});

	it('toDbInsert applies description default when omitted', () => {
		const result = OnboardingTemplateEntity.toDbInsert(
			{
				name: 'No Desc Template'
			},
			'org-1'
		);

		expect(result.description).toBeNull();
	});

	it('toDbInsert excludes readOnly fields (id, orgId, createdAt)', () => {
		const result = OnboardingTemplateEntity.toDbInsert(
			{
				name: 'Test'
			},
			'org-1'
		);

		expect(result).not.toHaveProperty('id');
		expect(result).not.toHaveProperty('created_at');
		// organization_id is set by toDbInsert, not from orgId field
	});

	it('toDbUpdate maps camelCase to snake_case and excludes id', () => {
		const result = OnboardingTemplateEntity.toDbUpdate({
			id: 't-1',
			name: 'Updated Name'
		});

		expect(result).toEqual({ name: 'Updated Name' });
		expect(result).not.toHaveProperty('id');
	});

	it('createSchema requires name, makes description optional', () => {
		const valid = OnboardingTemplateEntity.createSchema.safeParse({
			name: 'Test Template'
		});
		expect(valid.success).toBe(true);

		const missing = OnboardingTemplateEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);
	});

	it('createSchema accepts description', () => {
		const result = OnboardingTemplateEntity.createSchema.safeParse({
			name: 'Test',
			description: 'A desc'
		});
		expect(result.success).toBe(true);
	});

	it('has permission onboarding', () => {
		expect(OnboardingTemplateEntity.permission).toBe('onboarding');
	});

	it('requires full editor', () => {
		expect(OnboardingTemplateEntity.requireFullEditor).toBe(true);
	});

	it('has audit config for onboarding_template', () => {
		expect(OnboardingTemplateEntity.audit).toEqual({
			resourceType: 'onboarding_template'
		});
	});
});
