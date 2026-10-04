import { createRequestCriticalTasksSettingsContext } from '$lib/server/adapters/featureRequestContexts.server';
import { z } from 'zod';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

const defaultsInput = z
	.object({
		defaultExpirationMonths: z.number().int().min(1).max(120).nullable(),
		expiringSoonWarningDays: z.number().int().min(1).max(365).nullable()
	})
	.strict();

export const _postConfig = {
	context: createRequestCriticalTasksSettingsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	policyResource: { kind: 'organization' },
	input: defaultsInput,
	fn: async (ctx, input) => {
		if (!ctx.criticalTasksSettingsWrite) fail(500, 'Critical Tasks settings writer is unavailable');
		await ctx.criticalTasksSettingsWrite.saveDefaults(ctx.auth.orgId, input);
		ctx.audit.log({
			action: 'critical_tasks.defaults_updated',
			resourceType: 'organization',
			resourceId: ctx.auth.orgId,
			details: input
		});
		return { success: true as const };
	}
} satisfies RouteConfig<
	z.infer<typeof defaultsInput>,
	{ success: true },
	ReturnType<typeof createRequestCriticalTasksSettingsContext>
>;

export const POST = handle(_postConfig);
