import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
	createTestContext,
	createInMemoryDataStore,
	createTestAuthContext,
	createTestAuditPort,
	createTestReadOnlyGuard
} from './inMemory';
import type { UseCaseContext } from '$lib/server/core/ports';
import { handleUseCaseRequest, type RouteConfig } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

type TestContext = {
	store: ReturnType<typeof createInMemoryDataStore>;
	auth: ReturnType<typeof createTestAuthContext>;
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
	const auditPort = createTestAuditPort();
	const readOnly = overrides?.readOnly ?? false;
	const readOnlyGuard = createTestReadOnlyGuard(readOnly);
	return { store, auth, auditPort, readOnlyGuard, readOnly };
}

function toUseCaseCtx(t: TestContext): UseCaseContext {
	const ctx = createTestContext({
		auth: {
			orgId: t.auth.orgId,
			userId: t.auth.userId,
			role: t.auth.role,
			scopedGroupId: t.auth.scopedGroupId,
			isPrivileged: t.auth.isPrivileged,
			isFullEditor: t.auth.isFullEditor,
			requireView: t.auth.requireView,
			requireEdit: t.auth.requireEdit,
			requirePrivileged: t.auth.requirePrivileged,
			requireOwner: t.auth.requireOwner,
			requireFullEditor: t.auth.requireFullEditor,
			requireManageMembers: t.auth.requireManageMembers,
			requireGroupAccess: t.auth.requireGroupAccess,
			requireGroupAccessBatch: t.auth.requireGroupAccessBatch,
			requireGroupAccessByRecord: t.auth.requireGroupAccessByRecord,
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
		audit: t.auditPort,
		readOnlyGuard: t.readOnlyGuard
	};
}

describe('handleUseCaseRequest', () => {
	describe('permission enforcement', () => {
		it('calls requireView for read-only routes', async () => {
			let viewCalled = false;
			const t = buildTestCtx({
				auth: {
					requireView() {
						viewCalled = true;
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'personnel',
				fn: async () => 'ok'
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(viewCalled).toBe(true);
		});

		it('calls requireEdit for mutation routes', async () => {
			let editCalled = false;
			const t = buildTestCtx({
				auth: {
					requireEdit() {
						editCalled = true;
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'personnel',
				mutation: true,
				fn: async () => 'ok'
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(editCalled).toBe(true);
		});

		it('calls requirePrivileged for privileged permission', async () => {
			let called = false;
			const t = buildTestCtx({
				auth: {
					requirePrivileged() {
						called = true;
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'privileged',
				fn: async () => 'ok'
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(called).toBe(true);
		});

		it('calls requireOwner for owner permission', async () => {
			let called = false;
			const t = buildTestCtx({
				auth: {
					requireOwner() {
						called = true;
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'owner',
				fn: async () => 'ok'
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(called).toBe(true);
		});

		it('calls requireManageMembers for manageMembers permission', async () => {
			let called = false;
			const t = buildTestCtx({
				auth: {
					requireManageMembers() {
						called = true;
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'manageMembers',
				fn: async () => 'ok'
			};

			await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(called).toBe(true);
		});

		it('uses policy decisions instead of legacy edit flags when a policy action is declared', async () => {
			let editCalled = false;
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
					scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] },
					scopedGroupId: 'group-alpha',
					requireEdit() {
						editCalled = true;
						throw new Error('legacy edit flag should not decide this route');
					}
				}
			});

			const config: RouteConfig<void, string> = {
				permission: 'critical-tasks',
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'group', groupId: 'group-bravo' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
			expect(editCalled).toBe(false);
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
				permission: 'critical-tasks',
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
				permission: 'critical-tasks',
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
	});

	describe('read-only guard', () => {
		it('blocks mutations when org is read-only', async () => {
			const t = buildTestCtx({ readOnly: true });

			const config: RouteConfig<void, string> = {
				permission: 'personnel',
				mutation: true,
				fn: async () => 'ok'
			};

			await expect(handleUseCaseRequest(config, toUseCaseCtx(t), undefined)).rejects.toThrow(/read-only/i);
		});

		it('does not check read-only for non-mutation routes', async () => {
			const t = buildTestCtx({ readOnly: true });

			const config: RouteConfig<void, string> = {
				permission: 'personnel',
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toBe('ok');
		});

		it('allows explicitly exempted recovery mutations when org is read-only', async () => {
			const t = buildTestCtx({ readOnly: true });

			const config: RouteConfig<void, string> = {
				permission: 'owner',
				mutation: true,
				allowReadOnlyMutation: true,
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
				permission: 'personnel',
				mutation: true,
				input: z.object({ name: z.string().min(1) }),
				fn: async (_ctx, input) => `hello ${input.name}`
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), { name: 'Alice' });
			expect(result).toBe('hello Alice');
		});

		it('rejects invalid input with 400', async () => {
			const t = buildTestCtx();

			const config: RouteConfig<{ name: string }, string> = {
				permission: 'personnel',
				mutation: true,
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
				permission: 'personnel',
				mutation: true,
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
				permission: 'personnel',
				mutation: true,
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
				permission: 'personnel',
				fn: async (ctx) => ctx.store.findMany('items', ctx.auth.orgId)
			};

			const result = await handleUseCaseRequest(config, toUseCaseCtx(t), undefined);
			expect(result).toHaveLength(1);
		});
	});
});
