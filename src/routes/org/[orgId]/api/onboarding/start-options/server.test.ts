import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

function seedStartOptions(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('onboarding_templates', [
		{
			id: 'template-1',
			organization_id: ctx.auth.orgId,
			name: 'Reception',
			description: null,
			created_at: '2026-01-01'
		}
	]);
	ctx.store.seed('onboarding_template_steps', [
		{
			id: 'step-1',
			organization_id: ctx.auth.orgId,
			template_id: 'template-1',
			name: 'Issue CAC',
			description: null,
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0
		}
	]);
	ctx.store.seed('organization_rank_catalog', [
		{
			organization_id: ctx.auth.orgId,
			code: 'SPC',
			label: 'Specialist',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-4',
			state: 'active',
			source: 'default',
			sort_order: 0
		}
	]);
}

const template = {
	id: 'template-1',
	orgId: 'test-org',
	name: 'Reception',
	description: null,
	createdAt: '2026-01-01'
};

describe('/api/onboarding/start-options route config', () => {
	it('reads templates and the rank catalog for someone who can also add the Person', async () => {
		const ctx = createTestContext();
		seedStartOptions(ctx);

		expect(await handleUseCaseRequest(_getConfig, ctx, {}, () => ctx)).toEqual({
			templates: [template],
			hasTemplateSteps: true,
			rankCatalog: [
				{
					organizationId: 'test-org',
					code: 'SPC',
					label: 'Specialist',
					service: 'army',
					category: 'enlisted',
					payGrade: 'E-4',
					state: 'active',
					source: 'default',
					sortOrder: 0
				}
			],
			rankCatalogUnavailable: false
		});
	});

	it('leaves the rank catalog out for an Onboarding operator who cannot add People, and refuses a viewer', async () => {
		const auth = (onboarding: 'operate' | 'view') => ({
			role: 'member' as const,
			isPrivileged: false,
			scopeSet: { kind: 'organization' as const },
			capabilityMap: {
				calendar: 'none' as const,
				personnel: 'view' as const,
				training: 'none' as const,
				criticalTasks: 'none' as const,
				onboarding,
				ratingScheme: 'none' as const
			}
		});
		const operator = createTestContext({ auth: auth('operate') });
		seedStartOptions(operator);
		const viewer = createTestContext({ auth: auth('view') });

		expect(await handleUseCaseRequest(_getConfig, operator, {}, () => operator)).toEqual({
			templates: [template],
			hasTemplateSteps: true,
			rankCatalog: [],
			rankCatalogUnavailable: false
		});
		await expect(handleUseCaseRequest(_getConfig, viewer, {}, () => viewer)).rejects.toMatchObject({ status: 403 });
	});
});
