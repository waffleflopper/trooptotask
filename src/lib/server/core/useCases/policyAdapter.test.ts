import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { CapabilityMap, ScopeSet } from '$lib/access/memberAccessShape';
import {
	buildAuthoritativePolicyInput,
	evaluateAuthoritativePolicyDecision,
	NO_FEATURE_CAPABILITIES
} from './policyAdapter';

const noCapabilities: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

const organizationScope: ScopeSet = { kind: 'organization' };

describe('policy adapter', () => {
	it('builds the authoritative policy input behind the adapter seam', async () => {
		const input = await buildAuthoritativePolicyInput(
			{
				auth: {
					userId: 'user-1',
					role: 'member',
					capabilityMap: { ...noCapabilities, personnel: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			{ kind: 'group', groupId: 'group-alpha' }
		);

		expect(input).toMatchObject({
			decisionKind: 'server-authoritative',
			actor: {
				membershipRole: 'member',
				userId: 'user-1'
			},
			action: POLICY_ACTION_CATALOG.personnel.manageRecords,
			capabilityMap: { personnel: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
			resource: { kind: 'group', groupId: 'group-alpha' }
		});
	});

	it('evaluates authoritative feature decisions from auth facts', async () => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: { ...noCapabilities, calendar: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			POLICY_ACTION_CATALOG.calendar.manageAssignments,
			{ kind: 'group', groupId: 'group-alpha' }
		);

		expect(decision).toMatchObject({
			allowed: true,
			decisionKind: 'server-authoritative',
			reasonCode: 'allowed:capability',
			matchedCapability: { lane: 'calendar', actual: 'operate', required: 'operate' },
			matchedScope: { kind: 'group', groupId: 'group-alpha' }
		});
	});

	it('supports organization-governance evaluation without feature capabilities', async () => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'owner',
					capabilityMap: { ...noCapabilities, calendar: 'view' },
					scopeSet: organizationScope
				}
			},
			POLICY_ACTION_CATALOG.organization.deleteOrganization,
			{ kind: 'organization' },
			{
				capabilityMap: NO_FEATURE_CAPABILITIES,
				scopeSet: organizationScope
			}
		);

		expect(decision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:governance',
			audit: { capture: true, category: 'governance' }
		});
	});

	it('carries the actor user id for identity-owned decisions', async () => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					userId: 'user-1',
					role: 'member',
					capabilityMap: noCapabilities,
					scopeSet: organizationScope
				}
			},
			POLICY_ACTION_CATALOG.identity.readOwnNotifications,
			{ kind: 'user', userId: 'user-1' }
		);

		expect(decision).toMatchObject({
			allowed: true,
			reasonCode: 'allowed:identity-owner'
		});
	});
});
