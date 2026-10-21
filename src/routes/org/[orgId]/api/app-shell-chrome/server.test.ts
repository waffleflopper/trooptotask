import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppShellRequest } from '$lib/server/adapters/appShellRequestDelivery';
import { GET } from './+server';

vi.mock('$lib/server/adapters/appShellRequestDelivery', () => ({ createAppShellRequest: vi.fn() }));
const deferred = vi.fn();
const locals = {} as App.Locals;
const event = (part: string) =>
	({
		locals,
		cookies: {},
		params: { orgId: 'clinic' },
		url: new URL(`http://app.invalid/org/clinic/api/app-shell-chrome${part}`)
	}) as Parameters<typeof GET>[0];

beforeEach(() => {
	vi.mocked(createAppShellRequest)
		.mockReset()
		.mockReturnValue({ loadFirstPaint: vi.fn(), loadDeferredChrome: deferred });
	deferred.mockReset();
});

describe('GET AppShell chrome HTTP mapping', () => {
	it.each(['', '?part=unknown', '?part=notifications'])(
		'rejects unsupported part %s before any shell read',
		async (query) => {
			await expect(GET(event(query))).rejects.toMatchObject({ status: 400 });
			expect(createAppShellRequest).not.toHaveBeenCalled();
		}
	);

	it.each(['notification-count', 'organization-switcher'] as const)(
		'preserves generic optional %s failure as JSON',
		async (part) => {
			deferred.mockResolvedValue({ part, ok: false, reason: 'Unable to load app shell chrome' });
			const response = await GET(event(`?part=${part}`));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ part, ok: false, reason: 'Unable to load app shell chrome' });
		}
	);

	it('retains the canonical redirect instead of wrapping it in optional-chrome JSON', async () => {
		deferred.mockRejectedValue({ status: 308, location: '/org/clinic/api/app-shell-chrome?part=notification-count' });
		await expect(GET(event('?part=notification-count'))).rejects.toMatchObject({ status: 308 });
	});
});
