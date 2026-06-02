import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { enforceLoadAuthorization, enforceLayoutPolicy, enforceRouteAuthorization } from './routeAuthorization';

const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('route authorization', () => {
	it('enforces policy actions for route-level authorization', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, criticalTasks: 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});

		await enforceRouteAuthorization(ctx, {
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
			policyResource: { kind: 'group', groupId: 'group-alpha' }
		});
	});

	it('uses policy decision denial audit for route-level failures', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, criticalTasks: 'view' },
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			enforceRouteAuthorization(ctx, {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' }
			})
		).rejects.toMatchObject({ status: 403 });

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'criticalTasks.recordCompletion',
				details: expect.objectContaining({
					policyAction: 'criticalTasks.recordCompletion',
					reasonCode: 'denied:missing-capability'
				})
			})
		]);
	});

	it('blocks ordinary policy mutations in read-only mode', async () => {
		const ctx = createTestContext({
			readOnly: true,
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, criticalTasks: 'operate' },
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			enforceRouteAuthorization(ctx, {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' }
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});
	});

	it('uses billing-state read-only reasons when blocking policy mutation attempts', async () => {
		const ctx = createTestContext({
			readOnly: true,
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, criticalTasks: 'operate' },
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.readOnlyGuard.checkState = async () => ({
			isReadOnly: true,
			reason: 'payment_failure',
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});

		await expect(
			enforceRouteAuthorization(ctx, {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' }
			})
		).rejects.toMatchObject({
			status: 403,
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});
	});

	it('allows explicit read-only bypasses for policy routes that need them', async () => {
		const ctx = createTestContext({
			readOnly: true,
			auth: {
				userId: 'user-alpha',
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_CAPABILITIES,
				scopeSet: { kind: 'organization' }
			}
		});

		await enforceRouteAuthorization(ctx, {
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
			allowReadOnlyMutation: true
		});
	});

	it('enforces policy actions for loads without route-specific logic', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, training: 'view' },
				scopeSet: { kind: 'organization' }
			}
		});

		await enforceLoadAuthorization(ctx, {
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
			policyResource: { kind: 'organization' }
		});
	});

	it('provides a layout-level helper for settings and governance policy checks', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'admin',
				isPrivileged: true,
				capabilityMap: NO_CAPABILITIES,
				scopeSet: { kind: 'organization' }
			}
		});

		await enforceLayoutPolicy(ctx, {
			policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance
		});
	});

	it('denies layout policy helper access for non-governance members', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_CAPABILITIES,
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			enforceLayoutPolicy(ctx, {
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance
			})
		).rejects.toMatchObject({ status: 403 });

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'organization.accessGovernance',
				details: expect.objectContaining({
					policyAction: 'organization.accessGovernance',
					reasonCode: 'denied:governance-role'
				})
			})
		]);
	});

	it('defaults identity-owned route policy resources to the authenticated actor', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'user-alpha',
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_CAPABILITIES,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});

		await enforceRouteAuthorization(ctx, {
			policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences
		});
	});

	it('denies identity-owned route policies when an explicit resource points at another user', async () => {
		const ctx = createTestContext({
			auth: {
				userId: 'user-alpha',
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_CAPABILITIES,
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			enforceRouteAuthorization(ctx, {
				policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
				policyResource: { kind: 'user', userId: 'user-bravo' }
			})
		).rejects.toMatchObject({ status: 403, message: 'You can only manage your own resources' });

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'identity.updateOwnPreferences',
				details: expect.objectContaining({
					policyAction: 'identity.updateOwnPreferences',
					reasonCode: 'denied:not-resource-owner',
					resource: { kind: 'user', userId: 'user-bravo' }
				})
			})
		]);
	});
});
