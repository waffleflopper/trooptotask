import { buildSetupModel } from '$features/organization/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, privateJson } from '$lib/server/adapters/httpAdapter';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';
import { streamSetupData } from '../../../../setup/setupLoad.server';

export const _getConfig = {
	context: (request: AdmittedOrganizationRequest) => request,
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' as const },
	formatOutput: privateJson,
	fn: async (request: AdmittedOrganizationRequest) => {
		if (request.auth.role !== 'owner') fail(403, 'Only the Organization owner can read setup progress');
		const pending = streamSetupData(request);
		const [state, facts] = await Promise.all([pending.state, pending.facts]);
		return buildSetupModel({ state, facts, disabledFeatures: request.disabledFeatures });
	}
};

export const GET = handle(_getConfig);
