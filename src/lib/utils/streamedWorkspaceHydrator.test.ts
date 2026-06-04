import { describe, expect, it, vi } from 'vitest';
import { hydrateStreamedWorkspace } from './streamedWorkspaceHydrator';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('streamed workspace hydrator', () => {
	it('owns streamed promise cancellation and error normalization without knowing lane stores', async () => {
		const streamed = deferred<{ hydration: string }>();
		const hydrate = vi.fn().mockResolvedValue(undefined);
		const onReject = vi.fn();

		const cancel = hydrateStreamedWorkspace({
			streamedWorkspace: { data: streamed.promise },
			fallbackMessage: 'Failed to hydrate workspace',
			hydrate,
			onReject
		});

		cancel();
		streamed.resolve({ hydration: 'stale' });
		await streamed.promise;
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hydrate).not.toHaveBeenCalled();
		expect(onReject).not.toHaveBeenCalled();

		const rejected = hydrateStreamedWorkspace({
			streamedWorkspace: { data: Promise.reject('boom') },
			fallbackMessage: 'Failed to hydrate workspace',
			hydrate,
			onReject
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		rejected();

		expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ message: 'Failed to hydrate workspace' }));
	});

	it.each([0, false, ''])('hydrates immediate falsy workspace value %#', async (workspace) => {
		const hydrate = vi.fn().mockResolvedValue(undefined);
		const onReject = vi.fn();

		hydrateStreamedWorkspace({
			streamedWorkspace: { data: workspace },
			fallbackMessage: 'Failed to hydrate workspace',
			hydrate,
			onReject
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(hydrate).toHaveBeenCalledWith(workspace);
		expect(onReject).not.toHaveBeenCalled();
	});

	it('reports lane hydration failures for immediate workspace values', async () => {
		const onReject = vi.fn();

		hydrateStreamedWorkspace({
			streamedWorkspace: { data: { hydration: 'ready' } },
			fallbackMessage: 'Failed to hydrate workspace',
			hydrate: () => Promise.reject(new Error('store error')),
			onReject
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ message: 'store error' }));
	});

	it('reports synchronous lane hydration failures for immediate workspace values', async () => {
		const onReject = vi.fn();

		hydrateStreamedWorkspace({
			streamedWorkspace: { data: { hydration: 'ready' } },
			fallbackMessage: 'Failed to hydrate workspace',
			hydrate: () => {
				throw new Error('sync store error');
			},
			onReject
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(onReject).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync store error' }));
	});
});
