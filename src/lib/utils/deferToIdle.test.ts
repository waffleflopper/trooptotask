import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deferToIdle } from './deferToIdle';

describe('deferToIdle', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal('window', globalThis);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('calls callback via requestIdleCallback when available', () => {
		const callback = vi.fn();
		const mockRIC = vi.fn((cb: IdleRequestCallback) => {
			cb({} as IdleDeadline);
			return 1;
		});
		vi.stubGlobal('requestIdleCallback', mockRIC);
		vi.stubGlobal('cancelIdleCallback', vi.fn());

		deferToIdle(callback);

		expect(mockRIC).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledOnce();
	});

	it('falls back to setTimeout when requestIdleCallback is unavailable', () => {
		const callback = vi.fn();
		vi.stubGlobal('requestIdleCallback', undefined);

		deferToIdle(callback);

		expect(callback).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(callback).toHaveBeenCalledOnce();
	});

	it('returns a cancel function that prevents execution', () => {
		const callback = vi.fn();
		vi.stubGlobal('requestIdleCallback', undefined);

		const cancel = deferToIdle(callback);
		cancel();

		vi.advanceTimersByTime(1);
		expect(callback).not.toHaveBeenCalled();
	});

	it('no-ops during SSR when window is undefined', () => {
		const callback = vi.fn();
		const originalWindow = globalThis.window;
		// @ts-expect-error -- simulating SSR by removing window
		delete globalThis.window;

		const cancel = deferToIdle(callback);
		vi.advanceTimersByTime(100);

		expect(callback).not.toHaveBeenCalled();
		expect(cancel).toBeTypeOf('function');

		globalThis.window = originalWindow;
	});
});
