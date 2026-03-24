import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

interface ExemptionInput {
	assignmentTypeId: string;
	personnelIds?: string[];
}

interface ExemptionOutput {
	exemptPersonnelIds: string[];
}

export const _putConfig: RouteConfig<ExemptionInput, ExemptionOutput> = {
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		const { assignmentTypeId, personnelIds } = input;

		if (!assignmentTypeId) fail(400, 'Missing assignmentTypeId');

		const data = await ctx.store.update<{ exempt_personnel_ids: string[] }>(
			'assignment_types',
			ctx.auth.orgId,
			assignmentTypeId,
			{ exempt_personnel_ids: personnelIds ?? [] }
		);

		return { exemptPersonnelIds: data.exempt_personnel_ids };
	},
	audit: {
		action: 'duty_roster_exemption.updated',
		resourceType: 'duty_roster_exemption'
	}
};

export const PUT = handle(_putConfig);
