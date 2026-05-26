import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyTemplate, DutyTemplateWriteInput } from '$features/duty-roster/duty-roster.types';
import { createDutyTemplate, updateDutyTemplate } from '$lib/server/core/useCases/dutyTemplateCrud';

export const _postConfig: RouteConfig<DutyTemplateWriteInput, DutyTemplate> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createDutyTemplate(ctx, input)
};

export const _putConfig: RouteConfig<DutyTemplateWriteInput, DutyTemplate> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateDutyTemplate(ctx, input)
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
