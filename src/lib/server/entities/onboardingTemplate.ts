/**
 * Onboarding template entity — maps `onboarding_templates`.
 * Templates define the checklist structure for onboarding workflows. Steps are stored
 * separately in `onboarding_template_steps` (see `OnboardingTemplateStepEntity`).
 * Template writes are authorized by the Onboarding configure policy action.
 */
import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { OnboardingTemplate } from '$features/onboarding/onboarding.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const OnboardingTemplateEntity = defineEntity<OnboardingTemplate>({
	table: 'onboarding_templates',
	permission: 'onboarding',
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	groupScope: 'none',
	audit: { resourceType: 'onboarding_template' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		name: field(z.string()),
		description: field(z.string().nullable(), { insertDefault: null }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true })
	}
});
