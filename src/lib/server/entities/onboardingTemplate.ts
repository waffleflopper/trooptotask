import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { OnboardingTemplate } from '$features/onboarding/onboarding.types';

export const OnboardingTemplateEntity = defineEntity<OnboardingTemplate>({
	table: 'onboarding_templates',
	permission: 'onboarding',
	requireFullEditor: true,
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
