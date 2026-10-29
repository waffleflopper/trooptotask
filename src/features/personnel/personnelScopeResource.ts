import type { AdvisoryGroupScope } from '$lib/access/memberAccessShape';
import type { PolicyResource } from '$lib/access/policyEvaluator';

/** An actual-scope affordance target; each submitted Group still requires its own policy check. */
export function personnelScopeResource(scope: AdvisoryGroupScope): PolicyResource | null {
	if (scope.kind === 'organization') return { kind: 'organization' };
	const groupId = scope.grantedGroupIds?.[0];
	return groupId ? { kind: 'group', groupId } : null;
}
