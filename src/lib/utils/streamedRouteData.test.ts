import { describe, expect, it, vi } from 'vitest';
import { isPromiseLike, materializeWorkspaceData, observeDeferred, normalizeDeferredError } from './streamedRouteData';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('streamedRouteData helpers', () => {
	it('replaces a streamed workspace payload with resolved bootstrap data', () => {
		const bootstrap = {
			laneKey: 'calendar',
			data: { personnel: ['p1'] }
		};
		const streamedData = {
			orgId: 'org-1',
			calendar: {
				data: Promise.resolve(bootstrap)
			}
		};

		expect(materializeWorkspaceData(streamedData, 'calendar', bootstrap)).toEqual({
			orgId: 'org-1',
			calendar: {
				data: { personnel: ['p1'] }
			}
		});
	});

	it('distinguishes promise-like deferred values from concrete data', () => {
		expect(isPromiseLike(Promise.resolve('ready'))).toBe(true);
		expect(isPromiseLike({ then: () => undefined })).toBe(true);
		expect(isPromiseLike('ready')).toBe(false);
		expect(isPromiseLike(undefined)).toBe(false);
	});

	it('reports resolved deferred values while active', async () => {
		const onResolve = vi.fn();
		const onReject = vi.fn();

		await observeDeferred(Promise.resolve('ready'), {
			fallbackMessage: 'Failed to load workspace',
			onResolve,
			onReject
		});

		expect(onResolve).toHaveBeenCalledWith('ready');
		expect(onReject).not.toHaveBeenCalled();
	});

	it('reports rejected deferred values as normalized errors while active', async () => {
		const onResolve = vi.fn();
		const onReject = vi.fn();

		await observeDeferred(Promise.reject('boom'), {
			fallbackMessage: 'Failed to load workspace',
			onResolve,
			onReject
		});

		expect(onResolve).not.toHaveBeenCalled();
		expect(onReject).toHaveBeenCalledWith(expect.any(Error));
		expect(onReject.mock.calls[0]?.[0]).toMatchObject({
			message: 'Failed to load workspace'
		});
	});

	it('ignores stale deferred resolutions and rejections after cancellation', async () => {
		const onResolve = vi.fn();
		const onReject = vi.fn();
		const first = deferred<string>();
		let cancelled = false;

		const pending = observeDeferred(first.promise, {
			fallbackMessage: 'Failed to load workspace',
			onResolve,
			onReject,
			isCancelled: () => cancelled
		});

		cancelled = true;
		first.resolve('ready');
		await pending;

		const second = deferred<string>();
		const rejected = observeDeferred(second.promise, {
			fallbackMessage: 'Failed to load workspace',
			onResolve,
			onReject,
			isCancelled: () => cancelled
		});

		second.reject(new Error('late failure'));
		await rejected;

		expect(onResolve).not.toHaveBeenCalled();
		expect(onReject).not.toHaveBeenCalled();
	});

	it('preserves existing Error instances when normalizing failures', () => {
		const failure = new Error('calendar failed');

		expect(normalizeDeferredError(failure, 'fallback')).toBe(failure);
	});
});
