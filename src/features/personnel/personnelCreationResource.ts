import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { PolicyResource } from '$lib/access/policyEvaluator';

/** A creation admission target; the submitted Group still requires its own policy check. */
export function personnelCreationResource(scope: ScopeSet): PolicyResource | null {
	if (scope.kind === 'organization') return { kind: 'organization' };
	const groupId = scope.groupIds[0];
	return groupId ? { kind: 'group', groupId } : null;
}
