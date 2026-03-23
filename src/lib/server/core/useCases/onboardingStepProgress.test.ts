import { describe, it, expect } from 'vitest';
import {
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from '$lib/server/adapters/inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { toggleCheckbox } from './onboardingStepProgress';

type TestContext = Omit<UseCaseContext, 'store'> & {
	store: ReturnType<typeof createInMemoryDataStore>;
	auditPort: ReturnType<typeof createTestAuditPort>;
};

function buildContext(overrides?: { readOnly?: boolean }): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext();
	const auditPort = createTestAuditPort();
	const readOnlyGuard = createTestReadOnlyGuard(overrides?.readOnly ?? false);

	return { store, auth, audit: auditPort, readOnlyGuard, auditPort };
}

function seedStep(ctx: TestContext, overrides?: Record<string, unknown>) {
	ctx.store.seed('onboarding_step_progress', [
		{
			id: 'step-1',
			onboarding_id: 'ob-1',
			step_name: 'Get ID card',
			step_type: 'checkbox',
			training_type_id: null,
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: 'ts-1',
			active: true,
			organization_id: 'test-org',
			...overrides
		}
	]);
}

describe('toggleCheckbox', () => {
	it('sets completed on a checkbox step', async () => {
		const ctx = buildContext();
		seedStep(ctx);

		const result = await toggleCheckbox(ctx, { stepId: 'step-1', completed: true });

		expect(result.completed).toBe(true);
		expect(result.id).toBe('step-1');
	});

	it('unchecks a previously completed checkbox step', async () => {
		const ctx = buildContext();
		seedStep(ctx, { completed: true });

		const result = await toggleCheckbox(ctx, { stepId: 'step-1', completed: false });

		expect(result.completed).toBe(false);
	});

	it('rejects toggle on non-checkbox step types', async () => {
		const ctx = buildContext();
		seedStep(ctx, { step_type: 'paperwork' });

		await expect(toggleCheckbox(ctx, { stepId: 'step-1', completed: true })).rejects.toThrow(
			'Only checkbox steps can be toggled'
		);
	});

	it('blocks toggle when organization is read-only', async () => {
		const ctx = buildContext({ readOnly: true });
		seedStep(ctx);

		await expect(toggleCheckbox(ctx, { stepId: 'step-1', completed: true })).rejects.toThrow(
			'Organization is in read-only mode'
		);
	});
});
