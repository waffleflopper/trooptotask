import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuditPort } from '$lib/server/core/ports';
import { evaluateAuthoritativePolicyDecision } from './policyAdapter';
import { denyPolicyDecision, logPolicyDenial, policyDenialAuditDetails } from './policyDenial';

const baseCapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('policy denial', () => {
	it('builds audit details with caller-selected capability and scope shape', async () => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: { ...baseCapabilityMap, personnel: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			{ kind: 'group', groupId: 'group-bravo' }
		);

		expect(
			policyDenialAuditDetails(decision, {
				resource: { kind: 'group', groupId: 'group-bravo' },
				matchedCapability: { key: 'capability', value: 'actual' },
				matchedScope: { key: 'scope', value: 'kind' }
			})
		).toEqual({
			policyAction: 'personnel.manageRecords',
			reasonCode: 'denied:out-of-scope',
			resource: { kind: 'group', groupId: 'group-bravo' },
			capability: 'operate',
			scope: 'out-of-scope'
		});
	});

	it('builds audit details with caller-selected object capability and scope shape', async () => {
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: { ...baseCapabilityMap, personnel: 'operate' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
				}
			},
			POLICY_ACTION_CATALOG.personnel.manageRecords,
			{ kind: 'group', groupId: 'group-bravo' }
		);

		expect(
			policyDenialAuditDetails(decision, {
				matchedCapability: { key: 'matchedCapability', value: 'object' },
				matchedScope: { key: 'matchedScope', value: 'object' }
			})
		).toEqual({
			policyAction: 'personnel.manageRecords',
			reasonCode: 'denied:out-of-scope',
			matchedCapability: {
				lane: 'personnel',
				actual: 'operate',
				required: 'operate'
			},
			matchedScope: {
				kind: 'out-of-scope',
				resource: { kind: 'group', groupId: 'group-bravo' }
			}
		});
	});

	it('logs denied policy decisions through the shared audit shape', async () => {
		const audit = auditSpy();
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: baseCapabilityMap,
					scopeSet: { kind: 'organization' }
				}
			},
			POLICY_ACTION_CATALOG.calendar.manageAssignments,
			{ kind: 'organization' }
		);

		logPolicyDenial({
			audit,
			decision,
			resourceType: 'calendar',
			details: policyDenialAuditDetails(decision)
		});

		expect(audit.log).toHaveBeenCalledWith({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.manageAssignments',
				reasonCode: 'denied:missing-capability'
			},
			severity: 'warning'
		});
	});

	it('does not log when capture is disabled', async () => {
		const audit = auditSpy();
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: { ...baseCapabilityMap, calendar: 'view' },
					scopeSet: { kind: 'organization' }
				}
			},
			POLICY_ACTION_CATALOG.calendar.viewAvailability,
			{ kind: 'organization' }
		);

		logPolicyDenial({
			audit,
			decision,
			resourceType: 'calendar',
			details: policyDenialAuditDetails(decision)
		});

		expect(audit.log).not.toHaveBeenCalled();
	});

	it('logs and throws the caller-selected denial status and message', async () => {
		const audit = auditSpy();
		const decision = await evaluateAuthoritativePolicyDecision(
			{
				auth: {
					role: 'member',
					capabilityMap: baseCapabilityMap,
					scopeSet: { kind: 'organization' }
				}
			},
			POLICY_ACTION_CATALOG.identity.readOwnNotifications,
			{ kind: 'unscoped' }
		);

		expect(() =>
			denyPolicyDecision({
				audit,
				decision,
				resourceType: 'notifications',
				details: policyDenialAuditDetails(decision),
				status: 401,
				message: 'Unauthorized'
			})
		).toThrow('Unauthorized');
		expect(audit.log).toHaveBeenCalledOnce();
	});
});

function auditSpy(): AuditPort {
	return {
		log: vi.fn()
	};
}
