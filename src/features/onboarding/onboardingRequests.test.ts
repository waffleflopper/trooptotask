import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOnboardingStartOptions } from './onboardingRequests';

describe('loadOnboardingStartOptions', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('never answers the start options from the browser cache', async () => {
		const fetch = vi.fn(async () => Response.json({ templates: [] }));
		vi.stubGlobal('fetch', fetch);

		await loadOnboardingStartOptions('org-1');

		expect(fetch).toHaveBeenCalledWith('/org/org-1/api/onboarding/start-options', { cache: 'no-store' });
	});
});
