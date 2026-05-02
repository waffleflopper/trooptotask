import type { PolicyReasonCode } from './policyEvaluator';

export function explainPolicyReasonCode(reasonCode: PolicyReasonCode): string {
	switch (reasonCode) {
		case 'allowed:capability':
			return 'This member has the required capability and scope for the action.';
		case 'allowed:governance':
			return 'This action is allowed by the member governance role.';
		case 'allowed:identity-owner':
			return 'This action is allowed because the authenticated user owns the resource.';
		case 'denied:missing-capability':
			return 'This member does not have the feature capability required for the action.';
		case 'denied:out-of-scope':
			return 'This action is outside the member assigned scope.';
		case 'denied:read-only-overlay':
			return 'The organization is in read-only mode, so write actions are blocked.';
		case 'denied:owner-only':
			return 'Only the organization owner can perform this action.';
		case 'denied:governance-role':
			return 'This action requires an organization admin or owner role.';
		case 'denied:unauthenticated':
			return 'This action requires an authenticated user.';
		case 'denied:not-resource-owner':
			return 'This action is limited to the authenticated user who owns the resource.';
	}
}
