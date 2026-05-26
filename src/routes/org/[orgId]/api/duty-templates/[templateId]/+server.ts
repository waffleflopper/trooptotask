import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyTemplate } from '$features/duty-roster/duty-roster.types';
import { archiveDutyTemplate } from '$lib/server/core/useCases/dutyTemplateCrud';

const templateIdInputSchema = z.object({
	templateId: z.string().trim().min(1, 'Template ID is required.').uuid('Template ID must be a valid UUID.')
});

export const _deleteConfig: RouteConfig<{ templateId: string }, DutyTemplate> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
	policyResource: { kind: 'unscoped' },
	input: templateIdInputSchema,
	fn: (ctx, input) => archiveDutyTemplate(ctx, input)
};

export const DELETE = handle<{ templateId: string }, DutyTemplate>({
	..._deleteConfig,
	parseInput: async (event) => ({
		templateId: event.params.templateId as string
	})
});
