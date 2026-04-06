import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { DutyTemplate } from '$features/duty-roster/duty-roster.types';
import { archiveDutyTemplate } from '$lib/server/core/useCases/dutyTemplateCrud';

export const _deleteConfig: RouteConfig<{ templateId: string }, DutyTemplate> = {
	permission: 'calendar',
	mutation: true,
	fn: (ctx, input) => archiveDutyTemplate(ctx, input)
};

export const DELETE = handle<{ templateId: string }, DutyTemplate>({
	..._deleteConfig,
	parseInput: async (event) => ({
		templateId: event.params.templateId as string
	})
});
