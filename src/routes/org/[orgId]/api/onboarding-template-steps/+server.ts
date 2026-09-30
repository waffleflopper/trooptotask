import { fail } from '$lib/errors';
import {
	createOnboardingTemplateStep,
	updateOnboardingTemplateStep,
	deleteOnboardingTemplateStep
} from '$features/onboarding/index.server';
import type { OnboardingTemplateStep } from '$features/onboarding/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { validateUUID } from '$lib/server/validation';

const policyAction = POLICY_ACTION_CATALOG.onboarding.configureWorkflows;
const policyResource = { kind: 'organization' } as const;
export const _postConfig = {
	mutation: true,
	policyAction,
	policyResource,
	fn: (ctx, input) => createOnboardingTemplateStep(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, OnboardingTemplateStep>;
export const _putConfig = {
	mutation: true,
	policyAction,
	policyResource,
	fn: (ctx, input) => updateOnboardingTemplateStep(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, OnboardingTemplateStep>;
export const _deleteConfig = {
	mutation: true,
	policyAction,
	policyResource,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await deleteOnboardingTemplateStep(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, { success: true }>;
export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
