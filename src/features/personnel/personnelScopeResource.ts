import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { PolicyResource } from '$lib/access/policyEvaluator';

/** An actual-scope affordance target; each submitted Group still requires its own policy check. */
export function personnelScopeResource(scope: ScopeSet): PolicyResource | null {
	if (scope.kind === 'organization') return { kind: 'organization' };
	const groupId = scope.groupIds[0];
	return groupId ? { kind: 'group', groupId } : null;
}
