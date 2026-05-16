import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { AuditPort } from '$lib/server/core/ports';
import { requirePolicyDecision } from './policyAuthorization';

const baseCapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('policy authorization', () => {
	it('denies through the shared policy denial helper while preserving the route audit shape', async () => {
		const audit = auditSpy();

		await expect(
			requirePolicyDecision(
				{
					auth: {
						role: 'member',
						capabilityMap: { ...baseCapabilityMap, personnel: 'operate' },
						compatibilityLanes: {},
						scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
					},
					audit
				},
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				{ kind: 'group', groupId: 'group-bravo' }
			)
		).rejects.toThrow('This action is outside your assigned Group scope');

		expect(audit.log).toHaveBeenCalledWith({
			action: 'policy.denied',
			resourceType: 'personnel.manageRecords',
			details: {
				policyAction: 'personnel.manageRecords',
				reasonCode: 'denied:out-of-scope',
				resource: { kind: 'group', groupId: 'group-bravo' },
				matchedCapability: {
					lane: 'personnel',
					actual: 'operate',
					required: 'operate'
				},
				matchedScope: {
					kind: 'out-of-scope',
					resource: { kind: 'group', groupId: 'group-bravo' }
				}
			},
			severity: 'warning'
		});
	});
});

function auditSpy(): AuditPort {
	return {
		log: vi.fn()
	};
}
