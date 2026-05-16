import type { PolicyDecision, PolicyResource } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { AuditPort } from '$lib/server/core/ports';

export type PolicyDenialStatus = 401 | 403;

export interface PolicyDenialAuditDetailsOptions {
	policyActionId?: string;
	resource?: PolicyResource;
	matchedCapability?:
		| false
		| {
				key: string;
				value: 'actual' | 'full';
		  };
	matchedScope?:
		| false
		| {
				key: string;
				value: 'kind' | 'full';
		  };
	blockingOverlay?: boolean;
}

export interface LogPolicyDenialInput {
	audit?: AuditPort;
	decision: PolicyDecision;
	resourceType: string;
	resourceId?: string;
	details: Record<string, unknown>;
	capture?: boolean;
}

export interface DenyPolicyDecisionInput extends LogPolicyDenialInput {
	message: string;
	status?: PolicyDenialStatus;
}

export function denyPolicyDecision(input: DenyPolicyDecisionInput): never {
	logPolicyDenial(input);
	fail(input.status ?? 403, input.message);
}

export function logPolicyDenial(input: LogPolicyDenialInput): void {
	if (!input.audit || !(input.capture ?? input.decision.audit.capture)) {
		return;
	}

	input.audit.log({
		action: 'policy.denied',
		resourceType: input.resourceType,
		resourceId: input.resourceId,
		details: input.details,
		severity: 'warning'
	});
}

export function policyDenialAuditDetails(
	decision: PolicyDecision,
	options: PolicyDenialAuditDetailsOptions = {}
): Record<string, unknown> {
	const details: Record<string, unknown> = {
		policyAction: options.policyActionId ?? decision.action.id,
		reasonCode: decision.reasonCode
	};

	if (options.resource) {
		details.resource = options.resource;
	}

	if (options.matchedCapability && decision.matchedCapability) {
		details[options.matchedCapability.key] =
			options.matchedCapability.value === 'actual' ? decision.matchedCapability.actual : decision.matchedCapability;
	}

	if (options.matchedScope && decision.matchedScope) {
		details[options.matchedScope.key] =
			options.matchedScope.value === 'kind' ? decision.matchedScope.kind : decision.matchedScope;
	}

	if ((options.blockingOverlay ?? true) && decision.blockingOverlay) {
		details.blockingOverlay = decision.blockingOverlay.kind;
	}

	return details;
}
