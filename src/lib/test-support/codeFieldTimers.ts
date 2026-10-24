import { afterEach, beforeEach, vi } from 'vitest';

// bits-ui's PinInput resyncs its input on 0, 10 and 50 ms timers that outlive unmount and throw once happy-dom closes.
export function controlCodeFieldTimers() {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});
}
