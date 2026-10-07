import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createInMemoryDataStore, createTestAuthContext, createTestAuditPort } from './inMemory';
import { loadWithContextCore, loadWithDeferredContext } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { RequestFailure } from '$lib/errors';

function buildRequest(overrides?: { auth?: Parameters<typeof createTestAuthContext>[0] }) {
	return {
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort()
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('loadWithContextCore', () => {
	it('passes selected collaborators to fn and returns its result', async () => {
		const request = buildRequest();
		const store = createInMemoryDataStore();
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const result = await loadWithContextCore(
			request,
			{
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'organization' },
				fn: async (context) => ({ items: await context.store.findMany('items', context.orgId) })
			},
			() => ({ store, orgId: request.auth.orgId })
		);

		expect(result).toEqual({ items: [{ id: '1', organization_id: 'test-org', name: 'A' }] });
	});

	it('propagates errors from fn', async () => {
		const request = buildRequest();

		await expect(
			loadWithContextCore(
				request,
				{
					policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
					fn: async () => {
						throw new Error('load failed');
					}
				},
				() => undefined
			)
		).rejects.toThrow('load failed');
	});

	it('supports policy-first loads without legacy permission declarations', async () => {
		const request = buildRequest({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		const result = await loadWithContextCore(
			request,
			{
				policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
				policyResource: { kind: 'organization' },
				fn: async () => ({ items: [] })
			},
			() => undefined
		);

		expect(result).toEqual({ items: [] });
	});

	it('turns denied page loads into SvelteKit 403 errors without selecting collaborators', async () => {
		const request = buildRequest({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const selectContext = vi.fn(() => undefined);
		const operation = vi.fn(async () => ({ items: [] }));

		try {
			await loadWithContextCore(
				request,
				{
					policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
					policyResource: { kind: 'organization' },
					fn: operation
				},
				selectContext
			);
			throw new Error('Expected loadWithContextCore to throw');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 403,
				body: {
					message:
						"You don't have permission. This requires Personnel can manage permissions. Talk to your organization owner or admin."
				}
			});
		}
		expect(selectContext).not.toHaveBeenCalled();
		expect(operation).not.toHaveBeenCalled();
	});
});

describe('loadWithContextCore with defer: true', () => {
	it('rejects denied policies through the data promise without selecting collaborators', async () => {
		const request = buildRequest({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const selectContext = vi.fn(() => undefined);
		const operation = vi.fn(async () => ({ items: [] }));

		const { data } = loadWithContextCore(
			request,
			{
				policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
				policyResource: { kind: 'organization' },
				fn: operation,
				defer: true
			},
			selectContext
		);

		try {
			await data;
			throw new Error('Expected deferred load to reject');
		} catch (err) {
			expect(isHttpError(err)).toBe(true);
			expect(err).toMatchObject({
				status: 403,
				body: {
					message:
						"You don't have permission. This requires Training can view permissions. Talk to your organization owner or admin."
				}
			});
		}
		expect(selectContext).not.toHaveBeenCalled();
		expect(operation).not.toHaveBeenCalled();
	});

	it('returns a deferred data promise that resolves to fn result', async () => {
		const request = buildRequest();
		const store = createInMemoryDataStore();
		store.seed('items', [{ id: '1', organization_id: 'test-org', name: 'A' }]);

		const { data } = loadWithContextCore(
			request,
			{
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'organization' },
				fn: async (context) => ({ items: await context.store.findMany('items', context.orgId) }),
				defer: true
			},
			() => ({ store, orgId: request.auth.orgId })
		);

		expect(data).toBeInstanceOf(Promise);
		await expect(data).resolves.toEqual({ items: [{ id: '1', organization_id: 'test-org', name: 'A' }] });
	});

	it('returns the data promise before fn resolves', async () => {
		const request = buildRequest();
		const operationStarted = deferred<void>();
		const operationResult = deferred<{ done: boolean }>();
		let fnFinished = false;

		const { data } = loadWithContextCore(
			request,
			{
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				fn: async () => {
					operationStarted.resolve();
					const result = await operationResult.promise;
					fnFinished = true;
					return result;
				},
				defer: true
			},
			() => undefined
		);

		expect(data).toBeInstanceOf(Promise);
		await operationStarted.promise;
		expect(fnFinished).toBe(false);
		operationResult.resolve({ done: true });
		await expect(data).resolves.toEqual({ done: true });
		expect(fnFinished).toBe(true);
	});

	it('returns deferred data before admission and selects collaborators from the admitted request', async () => {
		const admission = deferred<ReturnType<typeof buildRequest>>();
		const store = createInMemoryDataStore();
		store.seed('items', [{ id: '1', organization_id: 'admitted-org', name: 'A' }]);
		const selectContext = vi.fn((request: ReturnType<typeof buildRequest>) => ({
			store,
			orgId: request.auth.orgId
		}));
		const operation = vi.fn(async (context: ReturnType<typeof selectContext>) => ({
			items: await context.store.findMany('items', context.orgId)
		}));

		const { data } = loadWithDeferredContext(
			admission.promise,
			{
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				fn: operation,
				defer: true
			},
			selectContext
		);

		expect(data).toBeInstanceOf(Promise);
		expect(selectContext).not.toHaveBeenCalled();
		expect(operation).not.toHaveBeenCalled();

		admission.resolve(buildRequest({ auth: { orgId: 'admitted-org' } }));
		await expect(data).resolves.toEqual({ items: [{ id: '1', organization_id: 'admitted-org', name: 'A' }] });
	});
});

describe('load failure boundaries', () => {
	const providerError = () => Object.assign(new Error('User not found'), { name: 'AuthApiError', status: 404 });
	const loadThrowing = (err: Error) => ({
		policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
		fn: async () => {
			throw err;
		}
	});

	it('turns an app-created 4xx into that HTTP error', async () => {
		await expect(
			loadWithContextCore(
				buildRequest(),
				loadThrowing(new RequestFailure(404, 'Personnel record not found')),
				() => undefined
			)
		).rejects.toMatchObject({ status: 404, body: { message: 'Personnel record not found' } });
	});

	it('does not adopt the status of a provider error', async () => {
		const err = providerError();
		await expect(loadWithContextCore(buildRequest(), loadThrowing(err), () => undefined)).rejects.toBe(err);
	});

	it('returns a generic 500 for a provider error through the full load boundary', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { data } = loadWithDeferredContext(
			Promise.resolve(buildRequest()),
			{ ...loadThrowing(providerError()), defer: true },
			() => undefined
		);

		await expect(data).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
		expect(log).toHaveBeenCalledWith('[http-adapter] Unhandled route error:', expect.stringContaining('AuthApiError'));
		log.mockRestore();
	});
});
