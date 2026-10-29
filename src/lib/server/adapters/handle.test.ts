import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import type { FeatureKey } from '$lib/access/featureSwitches';
import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { createInMemoryDataStore, createTestAuthContext, createTestAuditPort } from './inMemory';
import { handleUseCaseRequest, readFormData, readJsonBody, rethrowOrWrap } from './httpAdapter';
import { RequestFailure } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

type OperationConfig<TInput = void, TOutput = unknown, TContext = undefined> = Parameters<
	typeof handleUseCaseRequest<TInput, TOutput, TContext>
>[0];

function buildTestRequest(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	disabledFeatures?: FeatureKey[];
}) {
	return {
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort(),
		disabledFeatures: overrides?.disabledFeatures ?? []
	};
}

function jsonRequest(body: string) {
	return { request: new Request('http://app.invalid/api', { method: 'POST', body }) };
}

describe('request body readers', () => {
	it('returns a JSON object body unchanged', async () => {
		await expect(readJsonBody(jsonRequest('{"name":"Alpha","sortOrder":2}'))).resolves.toEqual({
			name: 'Alpha',
			sortOrder: 2
		});
	});

	it.each([
		['{bad', 'Invalid JSON in request body'],
		['', 'Invalid JSON in request body'],
		['null', 'Request body must be a JSON object'],
		['5', 'Request body must be a JSON object'],
		['"text"', 'Request body must be a JSON object'],
		['[{"id":"a"}]', 'Request body must be a JSON object']
	])('rejects the body %j with 400', async (body, message) => {
		await expect(readJsonBody(jsonRequest(body))).rejects.toMatchObject({ status: 400, message });
	});

	it('reads form data and rejects a JSON body on a form route with 400', async () => {
		const form = new FormData();
		form.set('file', 'contents');
		const formRequest = { request: new Request('http://app.invalid/api', { method: 'POST', body: form }) };
		expect((await readFormData(formRequest)).get('file')).toBe('contents');

		const jsonBody = new Request('http://app.invalid/api', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}'
		});
		await expect(readFormData({ request: jsonBody })).rejects.toMatchObject({
			status: 400,
			message: 'Request body must be form data'
		});
	});
});

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
					scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] })
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
	function wrapped(err: unknown) {
		try {
			rethrowOrWrap(err);
		} catch (caught) {
			return caught;
		}
		throw new Error('Expected rethrowOrWrap to throw');
	}

	it('forwards an app-created 4xx failure', () => {
		expect(wrapped(new RequestFailure(403, 'You do not have permission'))).toMatchObject({
			status: 403,
			body: { message: 'You do not have permission' }
		});
	});

	it.each([
		[
			'a provider error shaped like a 4xx',
			Object.assign(new Error('User not found'), { name: 'AuthApiError', status: 404 })
		],
		['an app-created 5xx failure', new RequestFailure(500, 'duplicate key value violates unique constraint')]
	])('logs and hides %s behind a generic 500', (_label, err) => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = wrapped(err);

		expect(isHttpError(response)).toBe(true);
		expect(response).toMatchObject({ status: 500, body: { message: 'Internal server error' } });
		expect(log).toHaveBeenCalledWith('[http-adapter] Unhandled route error:', expect.stringContaining(err.message));
		log.mockRestore();
	});

	it('forwards a 5xx failure whose message was written for the user', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = wrapped(
			new RequestFailure(500, 'Invitation could not be created because the account setup link could not be issued', {
				publicMessage: true
			})
		);

		expect(response).toMatchObject({
			status: 500,
			body: { message: 'Invitation could not be created because the account setup link could not be issued' }
		});
		log.mockRestore();
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
			scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] })
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
			scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] })
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

it('denies an API operation with the feature message before selecting its provider', async () => {
	const request = buildTestRequest({ disabledFeatures: ['evaluations'] });
	const selectContext = vi.fn();
	await expect(
		handleUseCaseRequest(
			{ policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries, fn: async () => ['protected'] },
			request,
			undefined,
			selectContext
		)
	).rejects.toMatchObject({
		status: 403,
		message:
			'This organization has turned off Evaluations. Speak with the organization owner to have it turned back on.'
	});
	expect(selectContext).not.toHaveBeenCalled();
});
