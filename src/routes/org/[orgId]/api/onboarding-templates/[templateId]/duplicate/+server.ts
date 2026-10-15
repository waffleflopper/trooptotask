import { createRequestOnboardingTemplateStepContext } from '$lib/server/adapters/featureRequestContexts.server';
import { z } from 'zod';
import type { RequestEvent } from '@sveltejs/kit';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { validateUUID } from '$lib/server/validation';
import { duplicateOnboardingTemplate, type DuplicateOnboardingTemplateResult } from '$features/onboarding/index.server';

const uuid = (message: string) => z.string().refine(validateUUID, message);
const duplicateTemplateInput = z.object({
	templateId: uuid('Invalid template ID'),
	requestId: uuid('Duplicate needs a request ID')
});

async function parseDuplicateTemplateInput(event: RequestEvent): Promise<z.infer<typeof duplicateTemplateInput>> {
	const body = await readJsonBody(event);
	return {
		templateId: event.params.templateId ?? '',
		requestId: typeof body.requestId === 'string' ? body.requestId : ''
	};
}

const duplicateTemplateConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.onboarding.configureWorkflows,
	policyResource: { kind: 'organization' },
	input: duplicateTemplateInput,
	parseInput: parseDuplicateTemplateInput,
	fn: (ctx, input) => duplicateOnboardingTemplate(ctx, input)
} satisfies RouteConfig<
	z.infer<typeof duplicateTemplateInput>,
	DuplicateOnboardingTemplateResult,
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;

export const POST = handle(duplicateTemplateConfig);
export const _postConfig = duplicateTemplateConfig;
