import { createRequestOnboardingTemplateStepContext } from '$lib/server/adapters/featureRequestContexts.server';
import { fail } from '$lib/errors';
import {
	createOnboardingTemplate,
	updateOnboardingTemplate,
	deleteOnboardingTemplate
} from '$features/onboarding/index.server';
import type { OnboardingTemplate } from '$features/onboarding/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';

const policyAction = POLICY_ACTION_CATALOG.onboarding.configureWorkflows;
const policyResource = { kind: 'organization' } as const;
export const _postConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction,
	policyResource,
	fn: (ctx, input) => createOnboardingTemplate(ctx, input)
} satisfies RouteConfig<
	Record<string, unknown>,
	OnboardingTemplate,
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;
export const _putConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction,
	policyResource,
	fn: (ctx, input) => updateOnboardingTemplate(ctx, input)
} satisfies RouteConfig<
	Record<string, unknown>,
	OnboardingTemplate,
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;
export const _deleteConfig = {
	context: createRequestOnboardingTemplateStepContext,
	mutation: true,
	policyAction,
	policyResource,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteOnboardingTemplate(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<
	Record<string, unknown>,
	{ success: true },
	ReturnType<typeof createRequestOnboardingTemplateStepContext>
>;
export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
