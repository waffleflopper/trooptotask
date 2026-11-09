import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const TEMPLATE_ID = '00000000-0000-4000-a000-000000000001';

const configureCapabilityMap: CapabilityMap = {
	calendar: 'none',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'configure',
	ratingScheme: 'none'
};

async function defaultFlags(ctx: ReturnType<typeof createTestContext>) {
	return (await ctx.onboardingCatalog.listTemplates()).map((template) => template.isDefault);
}

function seedTemplate(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('onboarding_templates', [
		{ id: TEMPLATE_ID, name: 'Standard Arrival', organization_id: 'test-org', is_default: false }
	]);
}

describe('PUT /api/onboarding-templates/default', () => {
	it('is a policy-first mutation on the Onboarding configure action', () => {
		expect(_putConfig.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.configureWorkflows);
		expect(_putConfig.policyResource).toEqual({ kind: 'organization' });
		expect(_putConfig.mutation).toBe(true);
	});

	it('names the template the default for an Organization admin, then clears it', async () => {
		const ctx = createTestContext();
		seedTemplate(ctx);

		await expect(handleUseCaseRequest(_putConfig, ctx, { templateId: TEMPLATE_ID }, () => ctx)).resolves.toEqual({
			templateId: TEMPLATE_ID
		});
		expect(await defaultFlags(ctx)).toEqual([true]);

		await expect(handleUseCaseRequest(_putConfig, ctx, { templateId: null }, () => ctx)).resolves.toEqual({
			templateId: null
		});
		expect(await defaultFlags(ctx)).toEqual([false]);
	});

	it('answers a member who can configure templates but is not an admin with 403 and changes nothing', async () => {
		const ctx = createTestContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: configureCapabilityMap }
		});
		seedTemplate(ctx);

		await expect(handleUseCaseRequest(_putConfig, ctx, { templateId: TEMPLATE_ID }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
		expect(await defaultFlags(ctx)).toEqual([false]);
	});
});
