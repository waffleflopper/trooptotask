import {
	evaluatePolicyDecision,
	type FeatureLanePolicyAction,
	type IdentityOwnedPolicyAction,
	type OrganizationGovernancePolicyAction,
	type PolicyAction,
	type PolicyDecision,
	type PolicyEvaluationInput,
	type PolicyReasonCode,
	type PolicyResource
} from './policyEvaluator';
import type { CapabilityMap, OrganizationAccessGrant, ScopeSet } from './memberAccessShape';
import type { PolicyAuditSink } from './policyAuditSink';
import { scopeSetResourceForGroupId } from './scopeSetAccess';
import { fail } from '$lib/errors';

type PolicyActor = Pick<OrganizationAccessGrant, 'role' | 'capabilityMap' | 'scopeSet'> &
	Partial<Pick<OrganizationAccessGrant, 'userId'>>;

interface PolicyEvaluationPorts {
	auth: PolicyActor;
}

const NO_FEATURE_CAPABILITIES: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

export async function evaluateAuthoritativePolicyDecision(
	ports: PolicyEvaluationPorts,
	action: PolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	return evaluatePolicyDecision(await buildAuthoritativePolicyInput(ports, action, resource));
}

async function buildAuthoritativePolicyInput(
	ports: PolicyEvaluationPorts,
	action: PolicyAction,
	resource: PolicyResource
): Promise<PolicyEvaluationInput> {
	return {
		decisionKind: 'server-authoritative',
		actor: {
			membershipRole: ports.auth.role,
			userId: ports.auth.userId
		},
		action,
		capabilityMap: ports.auth.capabilityMap,
		scopeSet: ports.auth.scopeSet,
		resource
	};
}

type PolicyDenialStatus = 401 | 403;

interface PolicyDenialAuditDetailsOptions {
	policyActionId?: string;
	resource?: PolicyResource;
	matchedCapability?:
		| false
		| {
				key: string;
				value: 'actual' | 'object';
		  };
	matchedScope?:
		| false
		| {
				key: string;
				value: 'kind' | 'object';
		  };
}

interface DenyPolicyDecisionInput {
	audit?: PolicyAuditSink;
	decision: PolicyDecision;
	resourceType: string;
	resourceId?: string;
	details: Record<string, unknown>;
	capture?: boolean;
	message: string;
	status?: PolicyDenialStatus;
}

export function denyPolicyDecision(input: DenyPolicyDecisionInput): never {
	if (input.audit && (input.capture ?? input.decision.audit.capture)) {
		input.audit.log({
			action: 'policy.denied',
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			details: input.details,
			severity: 'warning'
		});
	}
	fail(input.status ?? 403, input.message);
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

	return details;
}

interface FeaturePolicyPorts {
	auth: Pick<OrganizationAccessGrant, 'role' | 'capabilityMap' | 'scopeSet'>;
	audit?: PolicyAuditSink;
}

export function policyResourceForGroup(groupId: unknown): PolicyResource {
	return scopeSetResourceForGroupId(groupId);
}

export async function requireFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource,
	resourceType: string,
	resourceId?: string
): Promise<void> {
	const decision = await evaluateFeaturePolicy(ports, action, resource);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType,
		resourceId,
		details: policyDenialAuditDetails(decision, {
			policyActionId: action.id,
			matchedCapability: { key: 'capability', value: 'actual' },
			matchedScope: { key: 'scope', value: 'kind' }
		}),
		message: featurePolicyDenialMessage(decision.reasonCode, action.owner.lane)
	});
}

export async function evaluateFeaturePolicy(
	ports: FeaturePolicyPorts,
	action: FeatureLanePolicyAction,
	resource: PolicyResource
): Promise<PolicyDecision> {
	return evaluateAuthoritativePolicyDecision(ports, action, resource);
}

function featurePolicyDenialMessage(reasonCode: PolicyReasonCode, lane: string): string {
	switch (reasonCode) {
		case 'denied:out-of-scope':
			return 'You do not have access to records outside your assigned scope';
		default:
			return `You do not have permission to use ${lane} data`;
	}
}

interface GovernancePolicyPorts {
	auth: Pick<OrganizationAccessGrant, 'role'>;
	audit: PolicyAuditSink;
}

export async function requireGovernancePolicy(
	ports: GovernancePolicyPorts,
	action: OrganizationGovernancePolicyAction
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		{ auth: { ...ports.auth, capabilityMap: NO_FEATURE_CAPABILITIES, scopeSet: { kind: 'organization' } } },
		action,
		{ kind: 'organization' }
	);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: 'organization',
		details: policyDenialAuditDetails(decision, { policyActionId: action.id }),
		message: policyDenialMessage(decision.reasonCode)
	});
}

function policyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:owner-only') {
		return 'Only the organization owner can perform this action';
	}

	return 'This action requires an organization admin or owner role';
}

interface IdentityPolicyPorts {
	auth: Pick<OrganizationAccessGrant, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'>;
	audit: PolicyAuditSink;
}

export async function requireIdentityOwnedPolicy(
	ports: IdentityPolicyPorts,
	action: IdentityOwnedPolicyAction,
	ownerUserId: string | null | undefined,
	resourceType: string,
	resourceId?: string
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(
		ports,
		action,
		ownerUserId ? { kind: 'user', userId: ownerUserId } : { kind: 'unscoped' }
	);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType,
		resourceId,
		details: policyDenialAuditDetails(decision, { policyActionId: action.id }),
		status: denialStatus(decision.reasonCode),
		message: identityPolicyDenialMessage(decision.reasonCode)
	});
}

function denialStatus(reasonCode: PolicyReasonCode): 401 | 403 {
	return reasonCode === 'denied:unauthenticated' ? 401 : 403;
}

function identityPolicyDenialMessage(reasonCode: PolicyReasonCode): string {
	if (reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	return 'You can only manage your own resources';
}

interface PolicyPorts {
	auth: PolicyActor;
	audit: PolicyAuditSink;
}

const routePolicyAuditDetailShape = {
	matchedCapability: { key: 'matchedCapability', value: 'object' },
	matchedScope: { key: 'matchedScope', value: 'object' }
} satisfies Pick<PolicyDenialAuditDetailsOptions, 'matchedCapability' | 'matchedScope'>;

export async function requirePolicyDecision(
	ports: PolicyPorts,
	action: PolicyAction,
	resource: PolicyResource
): Promise<void> {
	const decision = await evaluateAuthoritativePolicyDecision(ports, action, resource);

	if (decision.allowed) {
		return;
	}

	denyPolicyDecision({
		audit: ports.audit,
		decision,
		resourceType: action.id,
		details: policyDenialAuditDetails(decision, {
			policyActionId: action.id,
			resource,
			...routePolicyAuditDetailShape
		}),
		message: routePolicyDenialMessage(decision, ports.auth.scopeSet)
	});
}

function routePolicyDenialMessage(decision: PolicyDecision, scopeSet?: ScopeSet): string {
	if (decision.reasonCode === 'denied:out-of-scope') {
		return scopeSet?.kind === 'groups'
			? 'This action is outside your assigned Group scope'
			: 'This action is outside your assigned scope';
	}

	if (decision.reasonCode === 'denied:unauthenticated') {
		return 'Unauthorized';
	}

	if (decision.reasonCode === 'denied:not-resource-owner') {
		return 'You can only manage your own resources';
	}

	if (decision.reasonCode === 'denied:owner-only') {
		return 'Only the organization owner can perform this action';
	}

	if (decision.reasonCode === 'denied:missing-capability') {
		return missingCapabilityMessage(decision);
	}

	return 'You do not have permission to perform this action';
}

function missingCapabilityMessage(decision: PolicyDecision): string {
	if (decision.action.owner.kind !== 'feature-lane' || !decision.matchedCapability) {
		return 'You do not have permission to perform this action';
	}

	const lane = featureLaneLabel(decision.matchedCapability.lane);
	const permission = capabilityPermissionLabel(decision.matchedCapability.required);
	return `You don't have permission. This requires ${lane} ${permission} permissions. Talk to your organization owner or admin.`;
}

function featureLaneLabel(lane: string): string {
	switch (lane) {
		case 'criticalTasks':
			return 'Critical Tasks';
		case 'ratingScheme':
			return 'Evals';
		default:
			return lane.charAt(0).toUpperCase() + lane.slice(1);
	}
}

function capabilityPermissionLabel(required: string): string {
	switch (required) {
		case 'view':
			return 'can view';
		case 'operate':
		case 'configure':
			return 'can manage';
		default:
			return 'the required';
	}
}

export type RoutePolicyAction =
	| FeatureLanePolicyAction
	| OrganizationGovernancePolicyAction
	| IdentityOwnedPolicyAction;

interface RouteAuthorizationPorts {
	auth: PolicyActor & Pick<OrganizationAccessGrant, 'userId'>;
	audit: PolicyAuditSink;
}

export interface RouteAuthorizationConfig {
	mutation?: boolean;
	policyAction: RoutePolicyAction;
	policyResource?: PolicyResource;
}

export interface LoadAuthorizationConfig {
	policyAction: RoutePolicyAction;
	policyResource?: PolicyResource;
}

export async function enforceRouteAuthorization(
	ports: RouteAuthorizationPorts,
	config: RouteAuthorizationConfig
): Promise<void> {
	await requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

export function enforceLoadAuthorization(
	ports: Pick<RouteAuthorizationPorts, 'auth' | 'audit'>,
	config: LoadAuthorizationConfig
): Promise<void> {
	return requirePolicyDecision(ports, config.policyAction, resolveRoutePolicyResource(ports.auth, config));
}

function resolveRoutePolicyResource(
	auth: Pick<OrganizationAccessGrant, 'userId'>,
	config: { policyAction?: PolicyAction; policyResource?: PolicyResource }
): PolicyResource {
	if (config.policyResource) {
		return config.policyResource;
	}

	if (config.policyAction?.owner.kind === 'identity-owned') {
		return { kind: 'user', userId: auth.userId };
	}

	return { kind: 'organization' };
}
