import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { createTestContext, createInMemoryDataStore, createTestAuthContext, createTestAuditPort } from './inMemory';
import { handleUseCaseRequest, rethrowOrWrap } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createPersonnelRecord, archivePersonnelRecord } from '$features/personnel/index.server';

type OperationConfig<TInput = void, TOutput = unknown, TContext = undefined> = Parameters<
	typeof handleUseCaseRequest<TInput, TOutput, TContext>
>[0];

function buildTestRequest(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }) {
	return {
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort()
	};
}

describe('handleUseCaseRequest', () => {
	describe('permission enforcement', () => {
		it('uses policy decisions when a policy action is declared', async () => {
			const t = buildTestRequest({
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

			const config: OperationConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'group', groupId: 'group-bravo' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, t, undefined, () => undefined);
			expect(result).toBe('ok');
		});

		it('executes policy-first routes without legacy permission declarations', async () => {
			const t = buildTestRequest({
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

			const config: OperationConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'ok'
			};

			const result = await handleUseCaseRequest(config, t, undefined, () => undefined);
			expect(result).toBe('ok');
		});

		it('audits denied policy writes before rejecting the request', async () => {
			const t = buildTestRequest({
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

			const config: OperationConfig<void, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
				policyResource: { kind: 'organization' },
				fn: async () => 'unreachable'
			};

			const selectContext = vi.fn(() => undefined);
			await expect(handleUseCaseRequest(config, t, undefined, selectContext)).rejects.toMatchObject({
				status: 403
			});
			expect(selectContext).not.toHaveBeenCalled();
			expect(t.audit.events).toEqual([
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
	});

	describe('Zod input validation', () => {
		it('validates and passes parsed input to fn', async () => {
			const t = buildTestRequest();

			const config: OperationConfig<{ name: string }, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResource: { kind: 'organization' },
				input: z.object({ name: z.string().trim().min(1) }),
				fn: async (_ctx, input) => `hello ${input.name}`
			};

			const result = await handleUseCaseRequest(config, t, { name: '  Alice  ' }, () => undefined);
			expect(result).toBe('hello Alice');
		});

		it('rejects invalid input with 400', async () => {
			const t = buildTestRequest();
			const selectContext = vi.fn(() => undefined);
			const operation = vi.fn(async (_ctx: undefined, input: { name: string }) => `hello ${input.name}`);

			const config: OperationConfig<{ name: string }, string> = {
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResource: { kind: 'organization' },
				input: z.object({ name: z.string().min(1) }),
				fn: operation,
				audit: { action: 'person.updated', resourceType: 'person' }
			};

			await expect(handleUseCaseRequest(config, t, { name: '' }, selectContext)).rejects.toMatchObject({
				status: 400
			});
			expect(selectContext).not.toHaveBeenCalled();
			expect(operation).not.toHaveBeenCalled();
			expect(t.audit.events).toEqual([]);
		});
	});

	describe('declarative audit', () => {
		it('logs audit event after successful execution', async () => {
			const t = buildTestRequest();

			const config: OperationConfig<void, { id: string }> = {
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

			await handleUseCaseRequest(config, t, undefined, () => undefined);

			expect(t.audit.events).toHaveLength(1);
			expect(t.audit.events[0]).toEqual({
				action: 'person.created',
				resourceType: 'person',
				resourceId: 'new-1'
			});
		});

		it('does not log audit on failure', async () => {
			const t = buildTestRequest();

			const config: OperationConfig<void, string> = {
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

			await expect(handleUseCaseRequest(config, t, undefined, () => undefined)).rejects.toThrow('boom');
			expect(t.audit.events).toHaveLength(0);
		});
	});

	describe('fn execution', () => {
		it('passes the selected collaborators and input to fn and returns its result', async () => {
			const t = buildTestRequest();
			const store = createInMemoryDataStore();
			store.seed('items', [
				{ id: '1', organization_id: 'test-org', name: 'thing' },
				{ id: '2', organization_id: 'test-org', name: 'other' }
			]);
			const selected = { store, orgId: t.auth.orgId };

			const config: OperationConfig<{ name: string }, unknown[], typeof selected> = {
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'organization' },
				fn: async (ctx, input) => ctx.store.findMany('items', ctx.orgId, { name: input.name })
			};

			const result = await handleUseCaseRequest(config, t, { name: 'thing' }, () => selected);
			expect(result).toEqual([{ id: '1', organization_id: 'test-org', name: 'thing' }]);
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

// Exercise the dispatcher with a real, observable write and no second policy gate
// in the callback: removing route authorization must expose a failing contract.
describe('policy dispatch write safety', () => {
	const noCapabilities = {
		calendar: 'none',
		personnel: 'none',
		training: 'none',
		criticalTasks: 'none',
		onboarding: 'none',
		ratingScheme: 'none'
	} as const;

	function fixture(auth: Parameters<typeof createTestAuthContext>[0] = {}) {
		const request = buildTestRequest({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: noCapabilities,
				...auth
			}
		});
		const store = createInMemoryDataStore();
		const before = { id: 'record-1', organization_id: request.auth.orgId, value: 'original' };
		store.seed('dispatch_records', [structuredClone(before)]);
		const selectContext = vi.fn(() => ({ auth: request.auth, store }));
		let calls = 0;
		const config: OperationConfig<void, void, ReturnType<typeof selectContext>> = {
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
			policyResource: { kind: 'group', groupId: 'group-bravo' },
			fn: async (ports) => {
				calls += 1;
				await ports.store.update('dispatch_records', ports.auth.orgId, 'record-1', { value: 'changed' });
			},
			audit: { action: 'record.updated', resourceType: 'dispatch_records' }
		};
		return { request, store, before, config, selectContext, calls: () => calls };
	}

	async function expectDenied(f: ReturnType<typeof fixture>, reasonCode: string) {
		// Assert state before checking the response so a controlled guard fault proves
		// detection of the unauthorized effect, not just an error-message mismatch.
		const outcome = await handleUseCaseRequest(f.config, f.request, undefined, f.selectContext).then(
			() => ({ status: 200 }),
			(error: unknown) => error
		);
		expect(await f.store.findMany('dispatch_records', f.request.auth.orgId)).toEqual([f.before]);
		expect(f.calls()).toBe(0);
		expect(f.selectContext).not.toHaveBeenCalled();
		expect(outcome).toMatchObject({ status: 403 });
		expect(f.request.audit.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ reasonCode, policyAction: f.config.policyAction.id })
			})
		]);
	}

	it.each([
		{ lane: 'criticalTasks', otherLane: 'training', action: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion },
		{ lane: 'ratingScheme', otherLane: 'personnel', action: POLICY_ACTION_CATALOG.ratingScheme.updateEntries }
	] as const)('allows $lane writes with no $otherLane capability', async ({ lane, action }) => {
		const f = fixture({
			capabilityMap: { ...noCapabilities, [lane]: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
		});
		f.config.policyAction = action;
		await handleUseCaseRequest(f.config, f.request, undefined, f.selectContext);
		expect(f.calls()).toBe(1);
		expect(await f.store.findMany('dispatch_records', f.request.auth.orgId)).toEqual([
			{ ...f.before, value: 'changed' }
		]);
		expect(f.request.audit.events).toEqual([
			{ action: 'record.updated', resourceType: 'dispatch_records', resourceId: undefined }
		]);
	});

	it.each([
		{ lane: 'criticalTasks', otherLane: 'training', action: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion },
		{ lane: 'ratingScheme', otherLane: 'personnel', action: POLICY_ACTION_CATALOG.ratingScheme.updateEntries }
	] as const)('rejects $lane writes despite configure capability in $otherLane', async ({ otherLane, action }) => {
		const f = fixture({ capabilityMap: { ...noCapabilities, [otherLane]: 'configure' } });
		f.config.policyAction = action;
		await expectDenied(f, 'denied:missing-capability');
	});

	it.each([
		{ name: 'another Group', resource: { kind: 'group', groupId: 'group-charlie' } },
		{ name: 'ungrouped records', resource: { kind: 'organization' } }
	] as const)('rejects a multi-Group member writing $name', async ({ resource }) => {
		const f = fixture({
			capabilityMap: { ...noCapabilities, criticalTasks: 'operate' },
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
		});
		f.config.policyResource = resource;
		await expectDenied(f, 'denied:out-of-scope');
	});

	it.each(['owner', 'admin'] as const)(
		'allows ordinary governance writes by an %s without feature capabilities',
		async (role) => {
			const f = fixture({ role, isPrivileged: true });
			f.config.policyAction = POLICY_ACTION_CATALOG.organization.rename;
			f.config.policyResource = { kind: 'organization' };
			await handleUseCaseRequest(f.config, f.request, undefined, f.selectContext);
			expect(f.calls()).toBe(1);
			expect(await f.store.findMany('dispatch_records', f.request.auth.orgId)).toEqual([
				{ ...f.before, value: 'changed' }
			]);
		}
	);

	it('rejects governance writes by a configure-capable member', async () => {
		const f = fixture({
			capabilityMap: {
				calendar: 'configure',
				personnel: 'configure',
				training: 'configure',
				criticalTasks: 'configure',
				onboarding: 'configure',
				ratingScheme: 'configure'
			}
		});
		f.config.policyAction = POLICY_ACTION_CATALOG.organization.rename;
		await expectDenied(f, 'denied:governance-role');
	});

	it('rejects an admin attempting an owner-only operation', async () => {
		const f = fixture({ role: 'admin', isPrivileged: true });
		f.config.policyAction = POLICY_ACTION_CATALOG.organization.deleteOrganization;
		await expectDenied(f, 'denied:owner-only');
	});

	it('rejects identity-owned writes without an authenticated actor', async () => {
		const f = fixture({ userId: '' });
		f.config.policyAction = POLICY_ACTION_CATALOG.identity.updateOwnPreferences;
		f.config.policyResource = { kind: 'user', userId: 'test-user' };
		await expectDenied(f, 'denied:unauthenticated');
	});

	it('rejects identity-owned writes to another user', async () => {
		const f = fixture();
		f.config.policyAction = POLICY_ACTION_CATALOG.identity.updateOwnPreferences;
		f.config.policyResource = { kind: 'user', userId: 'other-user' };
		await expectDenied(f, 'denied:not-resource-owner');
	});
});

// D03: retained writes are authorized by capability and scope, independent of
// commercial state. Exercise dispatch and the real use case against stored rows.
describe('Personnel writes without commercial enforcement', () => {
	it('creates and archives beyond former Personnel limits without reading commercial tables', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [{ id: 'test-org', subscription_tier: 'free' }]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				organization_id: 'test-org',
				source: 'stripe',
				commercial_plan: 'free',
				subscription_status: 'unpaid',
				collection_status: 'past_due'
			}
		]);
		ctx.rawStore.seed('organization_rank_catalog', [
			{
				organization_id: 'test-org',
				code: 'SGT',
				label: 'Sergeant',
				service: 'army',
				category: 'enlisted',
				pay_grade: 'E-5',
				state: 'active',
				source: 'built-in',
				sort_order: 0
			}
		]);
		ctx.rawStore.seed(
			'personnel',
			Array.from({ length: 1001 }, (_, i) => ({
				id: `person-${i}`,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: `Existing${i}`,
				first_name: 'Alex',
				slug: `existing-${i}`,
				group_id: null,
				archived_at: null
			}))
		);
		const reads = [ctx.store, ctx.rawStore].flatMap((store) => [
			vi.spyOn(store, 'findOne'),
			vi.spyOn(store, 'findMany'),
			vi.spyOn(store, 'findManyWithCount')
		]);
		const created = (await handleUseCaseRequest(
			{
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
				policyResource: { kind: 'organization' },
				fn: createPersonnelRecord
			},
			{ auth: ctx.auth, audit: ctx.audit },
			{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan', clinicRole: 'Team Leader', groupId: null },
			() => ({ auth: ctx.auth, audit: ctx.audit, store: ctx.store, rawStore: ctx.rawStore })
		)) as { id: string };
		await handleUseCaseRequest(
			{
				mutation: true,
				policyAction: POLICY_ACTION_CATALOG.personnel.archiveRecords,
				policyResource: { kind: 'organization' },
				fn: archivePersonnelRecord
			},
			{ auth: ctx.auth, audit: ctx.audit },
			created.id,
			() => ({
				auth: ctx.auth,
				audit: ctx.audit,
				store: ctx.store,
				rawStore: ctx.rawStore,
				personnelArtifactWrites: ctx.personnelArtifactWrites
			})
		);

		expect(await ctx.rawStore.findOne('personnel', 'test-org', { id: created.id })).toMatchObject({
			last_name: 'Smith',
			first_name: 'Jordan',
			archived_at: expect.any(String)
		});
		expect(await ctx.rawStore.findMany('personnel', 'test-org', { archived_at: null })).toHaveLength(1001);
		expect(ctx.auditPort.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ action: 'personnel.created', resourceId: created.id }),
				expect.objectContaining({ action: 'personnel.archived', resourceId: created.id })
			])
		);
		const queriedTables = reads.flatMap((read) => read.mock.calls.map(([table]) => table));
		expect(queriedTables).not.toContain('organization_billing_snapshots');
		expect(queriedTables).not.toContain('organization_plan_feature_overrides');
	});
});
