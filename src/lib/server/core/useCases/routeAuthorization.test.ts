import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	enforceLoadAuthorization,
	enforceRouteAuthorization,
	enforceRouteReadOnlyOverlay,
	shouldRunLegacyReadOnlyGuard
} from './routeAuthorization';

const NO_CAPABILITIES = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('route authorization', () => {
	it('enforces legacy read permissions for compatibility routes', async () => {
		let requireViewCalledWith = '';
		const ctx = createTestContext({
			auth: {
				requireView(area) {
					requireViewCalledWith = area;
				}
			}
		});

		await enforceRouteAuthorization(ctx, {
			permission: 'training'
		});

		expect(requireViewCalledWith).toBe('training');
	});

	it('requires mutations for feature permissions to use policy or defer to the use case', async () => {
		const ctx = createTestContext();

		await expect(
			enforceRouteAuthorization(ctx, {
				permission: 'personnel',
				mutation: true
			})
		).rejects.toThrow('Mutation route for personnel must declare policyAction or deferPolicyToUseCase');
	});

	it('allows a deferred mutation without route-level policy enforcement', async () => {
		let requireViewCalled = false;
		const ctx = createTestContext({
			auth: {
				requireView() {
					requireViewCalled = true;
				}
			}
		});

		await enforceRouteAuthorization(ctx, {
			permission: 'personnel',
			mutation: true,
			deferPolicyToUseCase: true
		});

		expect(requireViewCalled).toBe(false);
	});

	it('enforces Policy Actions for route-level authorization', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, criticalTasks: 'operate' },
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] }
			}
		});

		await enforceRouteAuthorization(ctx, {
			permission: 'critical-tasks',
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
			policyResource: { kind: 'group', groupId: 'group-alpha' }
		});
	});

	it('uses Policy Decision denial audit for route-level failures', async () => {
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
				permission: 'critical-tasks',
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

	it('centralizes the legacy read-only guard decision', async () => {
		expect(
			shouldRunLegacyReadOnlyGuard({
				permission: 'privileged',
				mutation: true
			})
		).toBe(true);
		expect(
			shouldRunLegacyReadOnlyGuard({
				permission: 'critical-tasks',
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion
			})
		).toBe(false);
		expect(
			shouldRunLegacyReadOnlyGuard({
				permission: 'personnel',
				mutation: true,
				deferPolicyToUseCase: true
			})
		).toBe(false);
	});

	it('blocks legacy mutations in read-only mode', async () => {
		const ctx = createTestContext({ readOnly: true });

		await expect(
			enforceRouteReadOnlyOverlay(ctx, {
				permission: 'privileged',
				mutation: true
			})
		).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});
	});

	it('uses billing-state read-only reasons when blocking direct mutation attempts', async () => {
		const ctx = createTestContext({ readOnly: true });
		ctx.readOnlyGuard.checkState = async () => ({
			isReadOnly: true,
			reason: 'payment_failure',
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});

		await expect(
			enforceRouteReadOnlyOverlay(ctx, {
				permission: 'privileged',
				mutation: true
			})
		).rejects.toMatchObject({
			status: 403,
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});
	});

	it('enforces Policy Actions for loads without route-specific logic', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_CAPABILITIES, training: 'view' },
				scopeSet: { kind: 'organization' }
			}
		});

		await enforceLoadAuthorization(ctx, {
			permission: 'training',
			policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
			policyResource: { kind: 'organization' }
		});
	});
});
