import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import {
	createTestContext,
	createInMemoryDataStore,
	createTestAuthContext,
	createTestScopeEnforcementPort,
	createTestAuditPort,
	createTestReadOnlyGuard
} from './inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { handleUseCaseRequest, rethrowOrWrap, type RouteConfig } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

type TestContext = {
	store: ReturnType<typeof createInMemoryDataStore>;
	auth: ReturnType<typeof createTestAuthContext>;
	scope: ReturnType<typeof createTestScopeEnforcementPort>;
	auditPort: ReturnType<typeof createTestAuditPort>;
	readOnlyGuard: ReturnType<typeof createTestReadOnlyGuard>;
	readOnly: boolean;
};

function buildTestCtx(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	readOnly?: boolean;
}): TestContext {
	const store = createInMemoryDataStore();
	const auth = createTestAuthContext(overrides?.auth);
	const scope = createTestScopeEnforcementPort();
	const auditPort = createTestAuditPort();
	const readOnly = overrides?.readOnly ?? false;
	const readOnlyGuard = createTestReadOnlyGuard(readOnly);
	return { store, auth, scope, auditPort, readOnlyGuard, readOnly };
}

function toUseCaseCtx(t: TestContext): UseCaseContext {
	const ctx = createTestContext({
		auth: {
			orgId: t.auth.orgId,
			userId: t.auth.userId,
			role: t.auth.role,
			isPrivileged: t.auth.isPrivileged,
			capabilityMap: t.auth.capabilityMap,
			scopeSet: t.auth.scopeSet
		},
		readOnly: t.readOnly
	});
	return {
		...ctx,
		store: t.store,
		rawStore: t.store,
		auth: t.auth,
		scope: t.scope,
		audit: t.auditPort,
		readOnlyGuard: t.readOnlyGuard
	};
}

describe('handleUseCaseRequest', () => {
	describe('permission enforcement', () => {
		it('uses policy decisions when a policy action is declared', async () => {
			const t = buildTestCtx({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
				}
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'group', groupId: 'group-bravo' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
		});

		it('executes policy-first routes without legacy permission declarations', async () => {
			const t = buildTestCtx({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'organization' }
				}
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
		});

		it('audits denied policy writes before rejecting the request', async () => {
			const t = buildTestCtx({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'configure',
						criticalTasks: 'view',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'organization' }
				}
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'unreachable'
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toMatchObject({
				status: 403
			});
			expect(t.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'criticalTasks.recordCompletion',
					severity: 'warning',
					details: expect.objectContaining({
						policyAction: 'criticalTasks.recordCompletion',
						reasonCode: 'denied:missing-capability'
					})
				})
			]);
		});

		it('uses policy read-only overlays for policy-backed mutations', async () => {
			const t = buildTestCtx({
				readOnly: true,
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'organization' }
				}
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'unreachable'
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toMatchObject({
				status: 403,
				message: 'Organization is in read-only mode'
			});
			expect(t.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'criticalTasks.recordCompletion',
					details: expect.objectContaining({
						policyAction: 'criticalTasks.recordCompletion',
						reasonCode: 'denied:read-only-overlay',
						blockingOverlay: 'read-only-mode'
					})
				})
			]);
		});

		it('uses policy read-only state messages for pure policy-first mutations', async () => {
			const t = buildTestCtx({
				readOnly: true,
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					},
					scopeSet: { kind: 'organization' }
				}
			});
			t.readOnlyGuard.checkState = async () => ({
				isReadOnly: true,
				reason: 'payment_failure',
				message:
					'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'unreachable'
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toMatchObject({
				status: 403,
				message:
					'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
			});
			expect(t.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'criticalTasks.recordCompletion',
					details: expect.objectContaining({
						policyAction: 'criticalTasks.recordCompletion',
						reasonCode: 'denied:read-only-overlay',
						blockingOverlay: 'read-only-mode'
					})
				})
			]);
		});
	});

	describe('read-only guard', () => {
		it('blocks mutations when org is read-only', async () => {
			const t = buildTestCtx({
				readOnly: true,
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'operate',
						onboarding: 'none',
						ratingScheme: 'none'
					}
				}
			});

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'ok'
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toThrow(/read-only/i);
		});

		it('does not check read-only for non-mutation routes', async () => {
			const t = buildTestCtx({ readOnly: true });

			const config: RouteConfig<void, string> = {
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'organization' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
		});

		it('allows explicitly exempted recovery mutations when org is read-only', async () => {
			const t = buildTestCtx({ readOnly: true });

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
				readOnlyModeException: 'identity-owned-preference',
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
		});
	});

	describe('Zod input validation', () => {
		it('validates and passes parsed input to fn', async () => {
			const t = buildTestCtx();

			const config: RouteConfig<{ name: string }, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResource: { kind: 'organization' },
				input: z.object({ name: z.string().min(1) }),
				fn: async (_ctx, input) => `hello ${input.name}`
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), { name: 'Alice' });
			expect(result).toBe('hello Alice');
		});

		it('rejects invalid input with 400', async () => {
			const t = buildTestCtx();

			const config: RouteConfig<{ name: string }, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResource: { kind: 'organization' },
				input: z.object({ name: z.string().min(1) }),
				fn: async (_ctx, input) => `hello ${input.name}`
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), { name: '' })).rejects.toThrow();
		});
	});

	describe('declarative audit', () => {
		it('logs audit event after successful execution', async () => {
			const t = buildTestCtx();

			const config: RouteConfig<void, { id: string }> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
				policyResource: { kind: 'organization' },
				fn: async () => ({ id: 'new-1' }),
				audit: {
					action: 'person.created',
					resourceType: 'person',
					resourceId: (result) => result.id
				}
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);

			expect(t.auditPort.events).toHaveLength(1);
			expect(t.auditPort.events[0]).toEqual({
				action: 'person.created',
				resourceType: 'person',
				resourceId: 'new-1'
			});
		});

		it('does not log audit on failure', async () => {
			const t = buildTestCtx();

			const config: RouteConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
				policyResource: { kind: 'organization' },
				fn: async () => {
					throw new Error('boom');
				},
				audit: {
					action: 'person.created',
					resourceType: 'person'
				}
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toThrow('boom');
			expect(t.auditPort.events).toHaveLength(0);
		});
	});

	describe('fn execution', () => {
		it('passes ctx and input to fn and returns result', async () => {
			const t = buildTestCtx();
			t.store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'thing' }]);

			const config: RouteConfig<void, unknown[]> = {
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'organization' },
				fn: async (ctx) => ctx.store.findMany('items', ctx.auth.orgId)
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toHaveLength(1);
		});
	});
});

describe('rethrowOrWrap', () => {
	it('converts framework-agnostic status errors to SvelteKit HTTP errors', () => {
		const denied = new Error('You do not have permission');
		(denied as unknown as { status: number }).status = 403;

		try {
			rethrowOrWrap(denied);
			throw new Error('Expected rethrowOrWrap to throw');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 403,
				body: { message: 'You do not have permission' }
			});
		}
	});
});
