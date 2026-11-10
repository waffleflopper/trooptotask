import { afterAll, vi } from 'vitest';

// A file in the shared project runs in the same worker as the files before it, so it must not hand them its stubs.
afterAll(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.useRealTimers();
});
