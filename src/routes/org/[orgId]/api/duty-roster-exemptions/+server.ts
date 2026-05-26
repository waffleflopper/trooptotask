import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';

interface ExemptionInput {
	assignmentTypeId: string;
	personnelIds?: string[];
}

interface ExemptionOutput {
	exemptPersonnelIds: string[];
}

export const _putConfig: RouteConfig<ExemptionInput, ExemptionOutput> = {
	mutation: true,
	// Exemptions shape the Duty Roster template pool; they are not per-day assignment writes.
	policyAction: POLICY_ACTION_CATALOG.calendar.configureDutyTemplates,
	policyResource: { kind: 'unscoped' },
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
