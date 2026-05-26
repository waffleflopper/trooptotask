import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import {
	duplicateOnboardingTemplate,
	type DuplicateOnboardingTemplateResult
} from '$lib/server/core/useCases/onboardingTemplateDuplicate';

const duplicateTemplateInput = z.object({ templateId: z.string().min(1) });

function parseDuplicateTemplateInput(event: RequestEvent): z.infer<typeof duplicateTemplateInput> {
	return { templateId: event.params.templateId ?? '' };
}

const duplicateTemplateConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	policyResource: { kind: 'organization' },
	input: duplicateTemplateInput,
	parseInput: parseDuplicateTemplateInput,
	fn: (ctx, input) => duplicateOnboardingTemplate(ctx, input.templateId)
} satisfies RouteConfig<z.infer<typeof duplicateTemplateInput>, DuplicateOnboardingTemplateResult>;

export const POST = handle(duplicateTemplateConfig);
export const _postConfig = duplicateTemplateConfig;
