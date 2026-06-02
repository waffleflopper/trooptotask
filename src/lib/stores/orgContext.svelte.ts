/**
 * OrgContext — per-org runtime identity and permission state for the current user.
 *
 * Passed through Svelte's component context tree (not a global singleton) so that
 * multiple orgs can render independently. Set once in the org layout component via
 * `setOrgContext(createOrgContext(layoutData))` and retrieved anywhere below via
 * `getOrgContext()`.
 *
 * OrgContext is the client-side complement to UseCaseContext on the server. It drives
 * UI permission checks (show/hide buttons, enable/disable forms). For actual data-access
 * enforcement, always rely on the server-side AuthContext.
 *
 * Capability Map and Scope Set are advisory client data only. They can hide,
 * disable, or explain controls, but server-side Policy Decisions remain the
 * authoritative enforcement boundary.
 */
import { setContext, getContext } from 'svelte';
import {
	capabilityMeets,
	createCapabilityMap,
	type CapabilityLevel,
	type CapabilityMap,
	type DurableFeatureLane,
	type ScopeSet
} from '$lib/access/memberAccessShape';
import {
	policyEvaluator,
	POLICY_ACTION_CATALOG,
	type FeatureLanePolicyAction,
	type OrganizationGovernancePolicyAction,
	type PolicyAction,
	type PolicyDecision,
	type PolicyResource
} from '$lib/access/policyEvaluator';
import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';

const ORG_CONTEXT_KEY = Symbol('org-context');

export interface OrgContext {
	readonly orgId: string;
	readonly orgUrlSegment: string;
	readonly orgName: string;
	readonly userId: string | null;
	readonly role: 'owner' | 'admin' | 'member';
	readonly isOwner: boolean;
	readonly isAdmin: boolean;
	readonly isPrivileged: boolean;
	readonly capabilityMap: CapabilityMap;
	readonly scopeSet: ScopeSet;
	readonly readOnly: boolean;
	readonly affordanceForFeatureAction: (action: FeatureLanePolicyAction, resource?: PolicyResource) => ClientAffordance;
	readonly affordanceForGovernanceAction: (
		action: OrganizationGovernancePolicyAction,
		resource?: PolicyResource
	) => ClientAffordance;
	readonly hasCapability: (lane: DurableFeatureLane, capability: Exclude<CapabilityLevel, 'none'>) => boolean;
	readonly isResourceInScope: (resource?: PolicyResource) => boolean;
}

export interface CreateOrgContextInput {
	orgId: string;
	orgUrlSegment?: string;
	orgName: string;
	userId: string | null;
	userRole: 'owner' | 'admin' | 'member';
	capabilityMap?: CapabilityMap;
	scopeSet?: ScopeSet;
	isReadOnly: boolean;
}

export interface ClientAffordance {
	readonly allowed: boolean;
	readonly visible: boolean;
	readonly disabled: boolean;
	readonly reason: PolicyDecision['reasonCode'];
	readonly explanation: string;
	readonly decision: PolicyDecision;
}

type OrgContextInputAccessor = () => CreateOrgContextInput;

function toInputAccessor(input: CreateOrgContextInput | OrgContextInputAccessor): OrgContextInputAccessor {
	return typeof input === 'function' ? input : () => input;
}

/**
 * Builds an OrgContext from layout data, deriving computed fields
 * (isOwner, isAdmin, isPrivileged, readOnly).
 */
export function createOrgContext(input: CreateOrgContextInput | OrgContextInputAccessor): OrgContext {
	const getInput = toInputAccessor(input);
	const getAccessShape = () => {
		const current = getInput();
		return {
			capabilityMap:
				current.capabilityMap ??
				(current.userRole === 'owner' || current.userRole === 'admin'
					? createCapabilityMap('configure')
					: createCapabilityMap('none')),
			scopeSet: current.scopeSet ?? { kind: 'organization' }
		};
	};
	return {
		get orgId() {
			return getInput().orgId;
		},
		get orgUrlSegment() {
			return getInput().orgUrlSegment ?? getInput().orgId;
		},
		get orgName() {
			return getInput().orgName;
		},
		get userId() {
			return getInput().userId;
		},
		get role() {
			return getInput().userRole;
		},
		get isOwner() {
			return getInput().userRole === 'owner';
		},
		get isAdmin() {
			return getInput().userRole === 'admin';
		},
		get isPrivileged() {
			const role = getInput().userRole;
			return role === 'owner' || role === 'admin';
		},
		get capabilityMap() {
			return getAccessShape().capabilityMap;
		},
		get scopeSet() {
			return getAccessShape().scopeSet;
		},
		get readOnly() {
			return getInput().isReadOnly;
		},
		affordanceForFeatureAction(action, resource = { kind: 'organization' }) {
			return evaluateClientAffordance(getInput(), getAccessShape(), action, resource);
		},
		affordanceForGovernanceAction(action, resource = { kind: 'organization' }) {
			return evaluateClientAffordance(getInput(), getAccessShape(), action, resource);
		},
		hasCapability(lane, capability) {
			return capabilityMeets(getAccessShape().capabilityMap[lane] ?? 'none', capability);
		},
		isResourceInScope(resource = { kind: 'organization' }) {
			return isResourceAllowedByScope(getAccessShape().scopeSet, resource);
		}
	};
}

function isResourceAllowedByScope(scopeSet: ScopeSet, resource: PolicyResource): boolean {
	if (resource.kind === 'unscoped') return true;
	if (scopeSet.kind === 'organization') return true;
	if (resource.kind === 'group') return scopeSet.groupIds.includes(resource.groupId);
	return false;
}

function evaluateClientAffordance(
	input: CreateOrgContextInput,
	accessShape: { capabilityMap: CapabilityMap; scopeSet: ScopeSet },
	action: PolicyAction,
	resource: PolicyResource
): ClientAffordance {
	const decision = policyEvaluator.evaluate({
		decisionKind: 'client-advisory',
		actor: { membershipRole: input.userRole },
		action,
		capabilityMap: accessShape.capabilityMap,
		scopeSet: accessShape.scopeSet,
		resource,
		overlays:
			input.isReadOnly && action.id !== POLICY_ACTION_CATALOG.personnel.archiveRecords.id
				? [{ id: 'org-read-only', kind: 'read-only-mode', label: 'Organization read-only mode' }]
				: undefined
	});
	const disabled = !decision.allowed && decision.reasonCode === 'denied:read-only-overlay';

	return {
		allowed: decision.allowed,
		visible: decision.allowed || disabled,
		disabled,
		reason: decision.reasonCode,
		explanation: explainPolicyReasonCode(decision.reasonCode),
		decision
	};
}

/**
 * Stores the OrgContext in Svelte's component context.
 * Must be called during component initialization.
 */
export function setOrgContext(ctx: OrgContext): void {
	setContext(ORG_CONTEXT_KEY, ctx);
}

/**
 * Retrieves the OrgContext from Svelte's component context.
 * Must be called during component initialization.
 * Throws if context has not been set.
 */
export function getOrgContext(): OrgContext {
	const ctx = getContext<OrgContext | undefined>(ORG_CONTEXT_KEY);
	if (!ctx) {
		throw new Error(
			'OrgContext not found. Ensure setOrgContext() is called in a parent layout or component before using getOrgContext().'
		);
	}
	return ctx;
}
