import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createCrudUseCases } from './crud';
import { onboardingTemplateCrudConfig, onboardingTemplateStepCrudConfig } from './onboardingTemplateCrud';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, auth, audit: auditPort, readOnlyGuard, auditPort };
}

describe('Onboarding Template CRUD', () => {
	it('creates a template and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(onboardingTemplateCrudConfig);

		const result = (await create(ctx, {
			name: 'New Soldier Checklist',
			description: 'Standard onboarding for new arrivals'
		})) as { name: string; description: string };

		expect(result).toMatchObject({
			name: 'New Soldier Checklist',
			description: 'Standard onboarding for new arrivals'
		});
		expect(ctx.auditPort.events[0].action).toBe('onboarding_template.created');
	});
});

describe('Onboarding Template Step CRUD', () => {
	it('creates a checkbox step and audits', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(onboardingTemplateStepCrudConfig);

		const result = (await create(ctx, {
			templateId: 'tmpl-1',
			name: 'Has military email',
			stepType: 'checkbox',
			sortOrder: 0
		})) as { name: string; stepType: string; templateId: string };

		expect(result).toMatchObject({
			name: 'Has military email',
			stepType: 'checkbox',
			templateId: 'tmpl-1'
		});
		expect(ctx.auditPort.events[0].action).toBe('onboarding_template_step.created');
	});

	it('creates a paperwork step with stages', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(onboardingTemplateStepCrudConfig);

		const result = (await create(ctx, {
			templateId: 'tmpl-1',
			name: 'CAC Card Request',
			stepType: 'paperwork',
			stages: ['with soldier', 'received by manager', 'submitted', 'access granted'],
			sortOrder: 1
		})) as { name: string; stages: string[] };

		expect(result).toMatchObject({
			name: 'CAC Card Request',
			stages: ['with soldier', 'received by manager', 'submitted', 'access granted']
		});
	});

	it('creates a training step with trainingTypeId', async () => {
		const ctx = buildContext();
		const { create } = createCrudUseCases(onboardingTemplateStepCrudConfig);

		const result = (await create(ctx, {
			templateId: 'tmpl-1',
			name: 'CPR Certification',
			stepType: 'training',
			trainingTypeId: 'tt-cpr',
			sortOrder: 2
		})) as { name: string; trainingTypeId: string };

		expect(result).toMatchObject({
			name: 'CPR Certification',
			trainingTypeId: 'tt-cpr'
		});
	});
});

describe('Onboarding Template deletion hooks', () => {
	it('cascade-deletes template steps when template is deleted', async () => {
		const ctx = buildContext();
		ctx.store.seed('onboarding_templates', [{ id: 'tmpl-1', name: 'Checklist A', organization_id: 'test-org' }]);
		ctx.store.seed('onboarding_template_steps', [
			{ id: 'ts-1', template_id: 'tmpl-1', name: 'Step A', organization_id: 'test-org' },
			{ id: 'ts-2', template_id: 'tmpl-1', name: 'Step B', organization_id: 'test-org' },
			{ id: 'ts-other', template_id: 'tmpl-other', name: 'Unrelated', organization_id: 'test-org' }
		]);

		const { remove } = createCrudUseCases(onboardingTemplateCrudConfig);
		await remove(ctx, 'tmpl-1');

		const remaining = await ctx.store.findMany<Record<string, unknown>>('onboarding_template_steps', 'test-org', {});
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe('ts-other');
	});

	it('nulls template_id on referencing onboardings when template is deleted', async () => {
		const ctx = buildContext();
		ctx.store.seed('onboarding_templates', [{ id: 'tmpl-1', name: 'Checklist A', organization_id: 'test-org' }]);
		ctx.store.seed('personnel_onboardings', [
			{ id: 'ob-1', template_id: 'tmpl-1', personnel_id: 'p-1', status: 'in_progress', organization_id: 'test-org' },
			{ id: 'ob-2', template_id: 'tmpl-1', personnel_id: 'p-2', status: 'completed', organization_id: 'test-org' },
			{ id: 'ob-3', template_id: 'tmpl-other', personnel_id: 'p-3', status: 'in_progress', organization_id: 'test-org' }
		]);

		const { remove } = createCrudUseCases(onboardingTemplateCrudConfig);
		await remove(ctx, 'tmpl-1');

		const ob1 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-1' });
		const ob2 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-2' });
		const ob3 = await ctx.store.findOne<Record<string, unknown>>('personnel_onboardings', 'test-org', { id: 'ob-3' });

		expect(ob1!.template_id).toBeNull();
		expect(ob2!.template_id).toBeNull();
		expect(ob3!.template_id).toBe('tmpl-other');
	});

	it('rejects non-full-editor from template CRUD', async () => {
		const ctx = buildContext({
			auth: {
				isFullEditor: false,
				role: 'member',
				isPrivileged: false,
				requireFullEditor: () => {
					throw { status: 403 };
				}
			}
		});
		const { create } = createCrudUseCases(onboardingTemplateCrudConfig);

		await expect(create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});

	it('blocks mutations in read-only mode', async () => {
		const ctx = buildContext({ readOnly: true });
		const { create } = createCrudUseCases(onboardingTemplateCrudConfig);

		await expect(create(ctx, { name: 'Blocked' })).rejects.toMatchObject({ status: 403 });
	});
});
