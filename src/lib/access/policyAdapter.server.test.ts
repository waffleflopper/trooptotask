import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from './policyEvaluator';
import {
	evaluateAuthoritativePolicyDecision,
	requireFeaturePolicy,
	requireGovernancePolicy,
	requireIdentityOwnedPolicy
} from './serverPolicy.server';

const noCapabilities = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

const member = {
	userId: 'user-1',
	role: 'member' as const,
	canManageMembers: false,
	capabilityMap: noCapabilities,
	scopeSet: { kind: 'organization' as const }
};

describe('Access server policy', () => {
	it.each([
		['group-alpha', true, 'allowed:capability'],
		['group-bravo', false, 'denied:out-of-scope']
	] as const)('evaluates the requested Group %s using the admitted grant', async (groupId, allowed, reasonCode) => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					...member,
					capabilityMap: { ...noCapabilities, calendar: 'operate' },
					scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] })
				}
			},
			POLICY_ACTION_CATALOG.calendar.manageAssignments,
			{ kind: 'group', groupId }
		);
		expect(decision).toMatchObject({
			allowed,
			decisionKind: 'server-authoritative',
			reasonCode,
			matchedCapability: { lane: 'calendar', actual: 'operate', required: 'operate' }
		});
	});

	it('rejects feature denial asynchronously after the caller continues, with its scalar audit details', async () => {
		const events: string[] = [];
		const audit = {
			log: vi.fn(() => {
				events.push('policy denied');
			})
		};
		const pending = requireFeaturePolicy(
			{
				auth: {
					...member,
					capabilityMap: { ...noCapabilities, personnel: 'operate' },
					scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] })
				},
				audit
			},
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			{ kind: 'group', groupId: 'group-bravo' },
			'personnel',
			'person-1'
		);
		events.push('caller continues');
		await expect(pending).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to records outside your assigned scope'
		});
		expect(events).toEqual(['caller continues', 'policy denied']);
		expect(audit.log).toHaveBeenCalledWith({
			action: 'policy.denied',
			resourceType: 'personnel',
			resourceId: 'person-1',
			severity: 'warning',
			details: {
				policyAction: 'personnel.manageRecords',
				reasonCode: 'denied:out-of-scope',
				capability: 'operate',
				scope: 'out-of-scope'
			}
		});
	});

	it('allows owner governance with no feature grants or Groups', async () => {
		const audit = { log: vi.fn() };
		const auth = { ...member, role: 'owner' as const, scopeSet: { kind: 'groups' as const, groupIds: [] } };
		await expect(
			requireGovernancePolicy({ auth, audit }, POLICY_ACTION_CATALOG.organization.deleteOrganization)
		).resolves.toBeUndefined();
		expect(audit.log).not.toHaveBeenCalled();
	});

	it.each([
		[
			'admin',
			POLICY_ACTION_CATALOG.organization.deleteOrganization,
			'Only the organization owner can perform this action',
			'denied:owner-only'
		],
		[
			'member',
			POLICY_ACTION_CATALOG.organization.accessGovernance,
			'This action requires an organization admin or owner role',
			'denied:governance-role'
		]
	] as const)('preserves the %s governance denial and audit', async (role, action, message, reasonCode) => {
		const audit = { log: vi.fn() };
		await expect(requireGovernancePolicy({ auth: { ...member, role }, audit }, action)).rejects.toMatchObject({
			status: 403,
			message
		});
		expect(audit.log).toHaveBeenCalledWith({
			action: 'policy.denied',
			resourceType: 'organization',
			severity: 'warning',
			details: { policyAction: action.id, reasonCode }
		});
	});

	it('allows self-owned actions without feature grants and rejects a peer owner', async () => {
		const ports = { auth: member, audit: { log: vi.fn() } };
		await expect(
			requireIdentityOwnedPolicy(ports, POLICY_ACTION_CATALOG.identity.readOwnNotifications, 'user-1', 'notifications')
		).resolves.toBeUndefined();
		await expect(
			requireIdentityOwnedPolicy(ports, POLICY_ACTION_CATALOG.identity.readOwnNotifications, 'peer-1', 'notifications')
		).rejects.toMatchObject({ status: 403, message: 'You can only manage your own resources' });
	});

	it('reports an absent admitted identity as Unauthorized', async () => {
		await expect(
			requireIdentityOwnedPolicy(
				{ auth: { ...member, userId: '' }, audit: { log: vi.fn() } },
				POLICY_ACTION_CATALOG.identity.readOwnNotifications,
				'user-1',
				'notifications'
			)
		).rejects.toMatchObject({ status: 401, message: 'Unauthorized' });
	});
});
