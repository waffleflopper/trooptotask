import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../appShell.test-support';
import { _createOnboardingLayoutLoad } from './+layout.server';

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: vi.fn(async (_locals, _cookies, _orgId, config) => ({ data: config.fn({}) }))
}));
vi.mock('$features/onboarding/index.server', () => ({
	fetchOnboardingWorkspace: vi.fn(async (_ctx, input) => input)
}));

afterEach(() => vi.useRealTimers());

type OnboardingLoadEvent = Parameters<ReturnType<typeof _createOnboardingLayoutLoad>>[0];

function eventFor(onboarding: 'none' | 'view') {
	const parentData = createReadyAppShellRouteData({ orgId: 'org-1', role: 'member' });
	if (parentData.shell.kind !== 'ready') throw new Error('Expected ready shell fixture');
	parentData.shell.member.capabilityMap = { ...createCapabilityMap('none'), onboarding };
	parentData.shell.member.scopeSet = { kind: 'groups', groupIds: ['group-1'] };
	return createUrlBlindLayoutEvent<OnboardingLoadEvent>(parentData);
}

describe('Onboarding layout', () => {
	it('returns an explicit forbidden page before streaming for a member without Onboarding view', async () => {
		const stream = vi.fn();
		const load = _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream });

		await expect(load(eventFor('none').event)).rejects.toMatchObject({ status: 403 });
		expect(stream).not.toHaveBeenCalled();
	});

	it('stops at the off state before streaming when Onboarding is turned off', async () => {
		const stream = vi.fn();
		const load = _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream });
		const parentData = createReadyAppShellRouteData({ orgId: 'org-1', role: 'owner' });

		await expect(
			load(createUrlBlindLayoutEvent<OnboardingLoadEvent>(parentData, { disabledFeatures: ['onboarding'] }).event)
		).rejects.toMatchObject({ status: 403, body: { featureOff: 'onboarding' } });
		expect(stream).not.toHaveBeenCalled();
	});

	it("streams the active workspace for the viewer's day from the time zone cookie", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
		const { event, depends } = eventFor('view');
		Object.assign(event, {
			cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) }
		});

		const result = await _createOnboardingLayoutLoad()(event);

		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data', 'app:viewer-day');
		await expect((result as { onboarding: { data: Promise<unknown> } }).onboarding.data).resolves.toEqual({
			mode: 'active',
			today: '2026-10-14'
		});
	});
});
