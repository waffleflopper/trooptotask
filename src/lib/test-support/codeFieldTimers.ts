import { afterAll } from 'vitest';

// bits-ui's PinInput resyncs its input on 0, 10 and 50 ms timers that outlive unmount and throw once happy-dom closes.
export function drainCodeFieldTimers() {
	afterAll(() => new Promise((resolve) => setTimeout(resolve, 60)));
}
