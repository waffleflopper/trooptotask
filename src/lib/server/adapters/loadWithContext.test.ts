import type { FeatureKey } from '$lib/access/featureSwitches';
import { describe, it, expect, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { createInMemoryDataStore, createTestAuthContext, createTestAuditPort } from './inMemory';
import { loadWithContextCore } from './httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { RequestFailure } from '$lib/errors';

function buildRequest(overrides?: {
	auth?: Parameters<typeof createTestAuthContext>[0];
	disabledFeatures?: FeatureKey[];
}) {
	return {
		auth: createTestAuthContext(overrides?.auth),
		audit: createTestAuditPort(),
		disabledFeatures: overrides?.disabledFeatures ?? []
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
});

describe('deferred loads that SvelteKit discards', () => {
	const noAccess = {
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
	} as const;
	const viewTraining = {
		policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
		policyResource: { kind: 'organization' },
		fn: async () => ({ items: [] }),
		defer: true
	} as const;

	/** SvelteKit drops a page's streamed promise when a sibling layout load throws, so nobody ever awaits it. */
	async function unhandledRejectionsWhileUnawaited(start: () => unknown) {
		const reasons: unknown[] = [];
		const record = (reason: unknown) => reasons.push(reason);
		process.on('unhandledRejection', record);
		try {
			start();
			await new Promise((resolve) => setTimeout(resolve, 10));
		} finally {
			process.off('unhandledRejection', record);
		}
		return reasons;
	}

	it('does not crash the process when a denied loadWithContextCore result is never awaited', async () => {
		let data!: Promise<unknown>;
		const reasons = await unhandledRejectionsWhileUnawaited(() => {
			({ data } = loadWithContextCore(buildRequest({ auth: noAccess }), viewTraining, () => undefined));
		});

		expect(reasons).toEqual([]);
		await expect(data).rejects.toMatchObject({ status: 403 });
	});
});

it.each([false, true])('returns the fresh feature-off page error before loading data, deferred=%s', (defer) => {
	const request = buildRequest({ disabledFeatures: ['training'] });
	const selectContext = vi.fn();
	const fn = vi.fn(async () => ({ records: ['protected'] }));
	try {
		loadWithContextCore(
			request,
			{ policyAction: POLICY_ACTION_CATALOG.training.viewRecords, defer, fn },
			selectContext
		);
		throw new Error('Expected a feature-off denial');
	} catch (err) {
		expect(err).toMatchObject({
			status: 403,
			body: {
				message:
					'This organization has turned off Training. Speak with the organization owner to have it turned back on.',
				featureOff: 'training'
			}
		});
	}
	expect(selectContext).not.toHaveBeenCalled();
	expect(fn).not.toHaveBeenCalled();
});
